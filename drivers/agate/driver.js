'use strict';

const Homey = require('homey');
const FWH = require("franklinwh");

module.exports = class AGateDriver extends Homey.Driver {

    /**
     * onInit is called when the driver is initialized.
     */
    async onInit() {
        this.log('AGateDriver has been initialized');
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

};
