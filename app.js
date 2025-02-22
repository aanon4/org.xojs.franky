'use strict';

const Homey = require('homey');

module.exports = class FrankyApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('FrankyApp has been initialized');
  }

};
