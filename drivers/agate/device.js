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
      this.setCapabilityValue("measure_power", -status.batteryOut).catch(this.error);
      this.setCapabilityValue("measure_battery", status.chargePercentage).catch(this.error);
      this.setCapabilityValue("measure_power.consumption", status.loadOut).catch(this.error);
      this.setCapabilityValue("measure_power.grid", -status.gridOut).catch(this.error);
      this.setCapabilityValue("measure_power.solar", status.solarIn).catch(this.error);
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

};
