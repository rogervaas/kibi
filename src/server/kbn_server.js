import { constant, once, compact, flatten } from 'lodash';
import { promisify, resolve, fromNode } from 'bluebird';
import { isWorker } from 'cluster';
import { fromRoot, pkg } from '../utils';
import Config from './config/config';
import loggingConfiguration from './logging/configuration';

const rootDir = fromRoot('.');

module.exports = class KbnServer {
  constructor(settings) {
    this.name = pkg.name;
    this.version = pkg.version;
    this.kibiVersion = pkg.kibi_version; // kibi: added to manage kibi version
    this.kibiKibanaAnnouncement = pkg.kibi_kibana_announcement; // kibi: added by kibi
    this.kibiEnterpriseEnabled = pkg.kibi_enterprise_enabled; // kibi: added by kibi
    this.build = pkg.build || false;
    this.rootDir = rootDir;
    this.settings = settings || {};

    this.ready = constant(this.mixin(
      require('./config/setup'), // sets this.config, reads this.settings
      require('./http'), // sets this.server
      require('./logging'),
      require('./warnings'),
      require('./status'),

      // writes pid file
      require('./pid'),

      // find plugins and set this.plugins
      require('./plugins/scan'),

      // disable the plugins that are disabled through configuration
      require('./plugins/check_enabled'),

      // disable the plugins that are incompatible with the current version of Kibana
      require('./plugins/check_version'),

      // tell the config we are done loading plugins
      require('./config/complete'),

      // setup this.uiExports and this.bundles
      require('../ui'),

      // setup server.uiSettings
      require('../ui/settings'),

      // ensure that all bundles are built, or that the
      // lazy bundle server is running
      require('../optimize'),

      // finally, initialize the plugins
      require('./plugins/initialize'),

      () => {
        if (this.config.get('server.autoListen')) {
          this.ready = constant(resolve());
          return this.listen();
        }
      }
    ));

    this.listen = once(this.listen);
  }

  /**
   * Extend the KbnServer outside of the constraits of a plugin. This allows access
   * to APIs that are not exposed (intentionally) to the plugins and should only
   * be used when the code will be kept up to date with Kibana.
   *
   * @param {...function} - functions that should be called to mixin functionality.
   *                         They are called with the arguments (kibana, server, config)
   *                         and can return a promise to delay execution of the next mixin
   * @return {Promise} - promise that is resolved when the final mixin completes.
   */
  async mixin(...fns) {
    for (const fn of compact(flatten(fns))) {
      await fn.call(this, this, this.server, this.config);
    }
  }

  /**
   * Tell the server to listen for incoming requests, or get
   * a promise that will be resolved once the server is listening.
   *
   * @return undefined
   */
  async listen() {
    let { server, config } = this;
    this.cleaningArray = []; // Kibi: added to manage cleanup functions through shutdown_manager

    await this.ready();
    await fromNode(cb => server.start(cb));
    await require('./shutdown_manager')(this, server); // kibi: added here to manage pid and gremlin server shutdown
    await require('./gremlin_server')(this, server, config); // kibi: added here to manage gremlin server

    if (isWorker) {
      // help parent process know when we are ready
      process.send(['WORKER_LISTENING']);
    }

    server.log(['listening', 'info'], `Server running at ${server.info.uri}`);
    return server;
  }

  async close() {
    await fromNode(cb => this.server.stop(cb));
  }

  async inject(opts) {
    if (!this.server) await this.ready();

    return await fromNode(cb => {
      try {
        this.server.inject(opts, (resp) => {
          cb(null, resp);
        });
      } catch (err) {
        cb(err);
      }
    });
  }

  applyLoggingConfiguration(settings) {
    const config = Config.withDefaultSchema(settings);
    const loggingOptions = loggingConfiguration(config);
    const subset = {
      ops: config.get('ops'),
      logging: config.get('logging')
    };
    const plain = JSON.stringify(subset, null, 2);
    this.server.log(['info', 'config'], 'New logging configuration:\n' + plain);
    this.server.plugins['even-better'].monitor.reconfigure(loggingOptions);
  }
};
