'use strict';

const Homey = require('homey');
const FWH = require("franklinwh");

const INTERVAL = 60 * 1000; // 1 minute
const MAX_RETRY = 5;

module.exports = class AGateDevice extends Homey.Device {

    /**
     * onInit is called when the device is initialized.
     */
    async onInit() {
        this.log('AGateDevice has been initialized');
        if (!this.hasCapability("measure_power.battery")) {
            this.addCapability("measure_power.battery").catch(this.log);
        }
        if (this.hasCapability("measure_power.grid")) {
            this.removeCapability("measure_power.grid").catch(this.log);
        }
        if (!this.hasCapability("meter_power.battery.exported")) {
            this.addCapability("meter_power.battery.exported").catch(this.log);
        }
        if (!this.hasCapability("meter_power.battery.imported")) {
            this.addCapability("meter_power.battery.imported").catch(this.log);
        }
        await this.getAPI();
        this.interval = null;
        await this.controls();
        await this.update();
        this.setInterval(INTERVAL);
    }

    /**
     * onAdded is called when the user adds the device, called just after pairing.
     */
    async onAdded() {
        this.log('AGateDevice has been added');
    }

    /**
     * onSettings is called when the user updates the device's settings.
     * @param {object} event the onSettings event data
     * @param {object} event.oldSettings The old settings object
     * @param {object} event.newSettings The new settings object
     * @param {string[]} event.changedKeys An array of keys changed since the previous version
     * @returns {Promise<string|void>} return a custom message that will be displayed
     */
    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.log('AGateDevice settings where changed');
        const data = this.getData();
        this.api = await FWH(newSettings.username, newSettings.password, data.gateway);
        await this.update();
    }

    /**
     * onRenamed is called when the user updates the device's name.
     * This method can be used this to synchronise the name to the device.
     * @param {string} name The new name
     */
    async onRenamed(name) {
        this.log('AGateDevice was renamed');
    }

    /**
     * onDeleted is called when the user deleted the device.
     */
    async onDeleted() {
        this.log('AGateDevice has been deleted');
        this.setInterval();
    }

    async getAPI() {
        if (!this.api) {
            const settings = this.getSettings();
            const data = this.getData();
            this.api = await FWH(settings.username, settings.password, data.gateway);
        }
        this.setAvailable().catch(this.error);
        return this.api;
    }

    async resetAPI(msg) {
        this.api = null;
        this.setUnavailable(msg).catch(this.error);
    }

    setInterval(interval) {
        this.retry = 0;
        this.homey.clearInterval(this.interval);
        if (interval) {
            this.interval = this.homey.setInterval(() => this.update(), interval);
        }
    }

    async update() {
        this.log("AGateDevice update");
        try {
            const api = await this.getAPI();
            const status = await api.getAGateStatus();
            this.updateCapabilityValue("measure_power.battery", status.batteryOut * 1000).catch(this.error);
            this.updateCapabilityValue("measure_battery", status.chargePercentage).catch(this.error);
            this.updateCapabilityValue("measure_power.consumption", status.loadOut * 1000).catch(this.error);
            this.updateCapabilityValue("measure_power", status.gridOut * 1000).catch(this.error);
            this.updateCapabilityValue("measure_power.solar", status.solarIn * 1000).catch(this.error);
            if (this.hasCapability("measure_power.generator")) {
                this.updateCapabilityValue("measure_power.generator", status.generatorIn * 1000).catch(this.error);
            }
            this.updateCapabilityValue("meter_power.battery.imported", status.batteryInKWh).catch(this.error);
            this.updateCapabilityValue("meter_power.battery.exported", status.batteryOutKWh).catch(this.error);
            this.updateCapabilityValue("meter_power.imported", status.gridInKWh).catch(this.error);
            this.updateCapabilityValue("meter_power.exported", status.gridOutKWh).catch(this.error);
            if (this.switches) {
                await api.updateSmartSwitches(this.switches);
                for (let i = 0; i < this.switches.length; i++) {
                    this.updateCapabilityValue(`onoff.${this.switches[i].id}`, this.switches[i].state).catch(this.error);
                }
            }
            this.updateCapabilityValue("operating_mode", await api.getMode()).catch(this.error);
            this.updateCapabilityValue("reserve_set", await api.getReserve()).catch(this.error);
            this.updateCapabilityValue("grid_online", await api.isGridOnline()).catch(this.error);
            this.retry = 0;
        }
        catch (e) {
            this.retry++;
            if (this.retry === MAX_RETRY) {
                this.resetAPI(e.message);
                this.retry = 0;
            }
        }
    }

    async updateCapabilityValue(capability, newvalue) {
        const oldvalue = this.getCapabilityValue(capability);
        //this.log(`updateCapabilityValue: ${capability} ${oldvalue} ${newvalue}`);
        if (oldvalue != newvalue) {
            await this.setCapabilityValue(capability, newvalue);
            this.triggerCapabilityListener(capability, newvalue).catch(_ => false);
        }
    }

    async controls() {
        this.log("AGateDevice controls");
        const api = await this.getAPI();
        const accessories = await api.getAccessoryList();
        for (let i = 0; i < accessories.length; i++) {
            switch (accessories[i].accessoryName) {
                case "Generator":
                    await this.addCapability("measure_power.generator");
                    break;
                case "Smart circuit":
                    const smart = await api.getSmartSwitches();
                    this.switches = smart;
                    for (let i = 0; i < smart.length; i++) {
                        const sw = smart[i];
                        const cap = `onoff.${sw.id}`;
                        await this.addCapability(cap);
                        await this.setCapabilityOptions(cap, {
                            title: { en: `${sw.name} (${sw.id})` },
                            setOnDim: false,
                            uiQuickAction: false
                        });
                        this.setCapabilityValue(cap, sw.state).catch(this.error);
                        this.registerCapabilityListener(cap, async (value) => {
                            sw.state = !!value;
                            api.setSmartSwitches(this.switches).catch(this.error);
                        });
                    }
                    break;
            }
        }
        this.registerCapabilityListener("operating_mode", async (value) => {
            switch (value) {
                case "tou":
                case "self":
                case "emer":
                    try {
                        const api = await this.getAPI();
                        await api.setMode(value);
                        // Update the reserve which can be different in different modes
                        const res = await api.getReserve();
                        this.setCapabilityValue("reserve_set", res).catch(this.error);
                        this.homey.flow.getDeviceTriggerCard("mode_changed").trigger(this, { newMode: value }).catch(this.error);
                    }
                    catch (e) {
                        this.resetAPI(e.message);
                    }
                    break;
                default:
                    break;
            }
        });
        this.registerCapabilityListener("reserve_set", async (value) => {
            if (this.getCapabilityValue("operating_mode") !== "emer") {
                try {
                    const api = await this.getAPI();
                    await api.setReserve(value);
                }
                catch (e) {
                    this.resetAPI(e.message);
                }
            }
            else {
                this.setCapabilityValue("reserve_set", 100).catch(this.error);
            }
        });
        this.registerCapabilityListener("grid_online", async (value) => {
            if (value) {
                this.homey.flow.getDeviceTriggerCard("grid_on").trigger(this).catch(this.error);
            }
            else {
                this.homey.flow.getDeviceTriggerCard("grid_off").trigger(this).catch(this.error);
            }
        });
    }

    async getSmartSwitches() {
        if (!this.switches) {
            return null;
        }
        await (await this.getAPI()).updateSmartSwitches(this.switches);
        return this.switches;
    }

    async getMode() {
        return (await this.getAPI()).getMode();
    }

};
