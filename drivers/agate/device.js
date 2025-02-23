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
        const settings = this.getSettings();
        const data = this.getData();
        this.api = await FWH(settings.username, settings.password, data.gateway);
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
            const status = await this.api.getAGateStatus();
            this.setCapabilityValue("measure_power", -status.batteryOut * 1000).catch(this.error);
            this.setCapabilityValue("measure_battery", status.chargePercentage).catch(this.error);
            this.setCapabilityValue("measure_power.consumption", status.loadOut * 1000).catch(this.error);
            this.setCapabilityValue("measure_power.grid", -status.gridOut * 1000).catch(this.error);
            this.setCapabilityValue("measure_power.solar", status.solarIn * 1000).catch(this.error);
            if (this.hasCapability("measure_power.generator")) {
                this.setCapabilityValue("measure_power.generator", status.generatorIn * 1000).catch(this.error);
            }
            if (this.switches) {
                await this.api.updateSmartSwitches(this.switches);
                for (let i = 0; i < this.switches.length; i++) {
                    this.setCapabilityValue(`onoff.${this.switches[i].id}`, this.switches[i].state).catch(this.error);
                }
            }
            this.setCapabilityValue("operating_mode", await this.api.getMode()).catch(this.error);
            this.setAvailable().catch(this.error);
            this.retry = 0;
        }
        catch (e) {
            this.retry++;
            if (this.retry === MAX_RETRY) {
                this.setUnavailable(e.message).catch(this.error);
                this.retry = 0;
            }
        }
    }

    async controls() {
        this.log("AGateDevice controls");
        const accessories = await this.api.getAccessoryList();
        for (let i = 0; i < accessories.length; i++) {
            switch (accessories[i].accessoryName) {
                case "Generator":
                    await this.addCapability("measure_power.generator");
                    break;
                case "Smart circuit":
                    const smart = await this.api.getSmartSwitches();
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
                        await this.setCapabilityValue(cap, sw.state);
                        this.registerCapabilityListener(cap, async (value) => {
                            sw.state = !!value;
                            await this.api.setSmartSwitches(this.switches);
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
                    const oldMode = await this.api.getMode();
                    if (oldMode != value) {
                        await this.api.setMode(value);
                        this.homey.flow.getTriggerCard("mode_changed").trigger({
                            newMode: value,
                            oldMode: oldMode
                        }).error(this.error);
                    }
                    break;
                default:
                    break;
            }
        });
    }

};
