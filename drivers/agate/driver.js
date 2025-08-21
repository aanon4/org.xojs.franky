'use strict';

const Homey = require('homey');
const FWH = require("franklinwh");

module.exports = class AGateDriver extends Homey.Driver {

    /**
     * onInit is called when the driver is initialized.
     */
    async onInit() {
        this.log('AGateDriver has been initialized');
        this.flows();
    }

    async onPair(session) {
        let username;
        let password;
        let gateway;
        session.setHandler("login", async (data) => {
            try {
                await FWH(data.username, data.password);
                username = data.username;
                password = data.password;
                this.log("Auth success");
                return true;
            }
            catch (e) {
                this.log("Auth failed", e);
                return false;
            }
        });
        session.setHandler("set_gateway", async (data) => {
            gateway = data.gateway;
            return true;
        });
        session.setHandler("list_devices", async () => {
            return [{
                name: `aGate: ${gateway}`,
                data: {
                    gateway: gateway
                },
                settings: {
                    username: username,
                    password: password
                }
            }];
        });
    }

    flows() {
        this.homey.flow.getActionCard("sw1_on").registerRunListener(async (args, state) => {
            args.device.updateCapabilityValue("onoff.sw1", true).catch(this.error);
            return true;
        });
        this.homey.flow.getActionCard("sw1_off").registerRunListener(async (args, state) => {
            args.device.updateCapabilityValue("onoff.sw1", false).catch(this.error);
            return true;
        });
        this.homey.flow.getActionCard("sw2_on").registerRunListener(async (args, state) => {
            if (args.device.hasCapability("onoff.sw2")) {
                args.device.updateCapabilityValue("onoff.sw2", true).catch(this.error);
            }
            return true;
        });
        this.homey.flow.getActionCard("sw2_off").registerRunListener(async (args, state) => {
            if (args.device.hasCapability("onoff.sw2")) {
                args.device.updateCapabilityValue("onoff.sw2", false).catch(this.error);
            }
            return true;
        });
        this.homey.flow.getActionCard("sw3_on").registerRunListener(async (args, state) => {
            args.device.updateCapabilityValue("onoff.sw3", true).catch(this.error);
            return true;
        });
        this.homey.flow.getActionCard("sw3_off").registerRunListener(async (args, state) => {
            args.device.updateCapabilityValue("onoff.sw3", false).catch(this.error);
            return true;
        });
        this.homey.flow.getActionCard("mode_tou").registerRunListener(async (args, state) => {
            args.device.updateCapabilityValue("operating_mode", "tou").catch(this.error);
            return true;
        });
        this.homey.flow.getActionCard("mode_self").registerRunListener(async (args, state) => {
            args.device.updateCapabilityValue("operating_mode", "self").catch(this.error);
            return true;
        });
        this.homey.flow.getActionCard("mode_emer").registerRunListener(async (args, state) => {
            args.device.updateCapabilityValue("operating_mode", "emer").catch(this.error);
            return true;
        });
        this.homey.flow.getConditionCard("is_sw1_on").registerRunListener(async (args, state) => {
            const sw = (await args.device.getSmartSwitches()).find(sw => sw.id == "sw1");
            return sw.state;
        });
        this.homey.flow.getConditionCard("is_sw2_on").registerRunListener(async (args, state) => {
            if (args.device.hasCapability("onoff.sw2")) {
                const sw = (await args.device.getSmartSwitches()).find(sw => sw.id == "sw2");
                return sw.state;
            }
            return false;
        });
        this.homey.flow.getConditionCard("is_sw3_on").registerRunListener(async (args, state) => {
            const sw = (await args.device.getSmartSwitches()).find(sw => sw.id == "sw3");
            return sw.state;
        });
        this.homey.flow.getConditionCard("is_mode").registerRunListener(async (args, state) => {
            return args.mode == await args.device.getMode();
        });
    }

};
