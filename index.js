/* eslint no-console       : 0 */
/* eslint no-global-assign : 0 */

process.title = 'iris2mqtt';

terminating = false;

if (typeof process.env.NODE_ENV !== 'undefined' && process.env.NODE_ENV !== null && process.env.NODE_ENV !== '') {
	appEnv = process.env.NODE_ENV;
}
else {
	appEnv = 'development';
}


// hgbg libraries
api     = require('./api');
bitmask = require('./bitmask');
hass    = require('./hass');
hex     = require('./hex');
json    = require('./json');
log     = require('./log-output');
mqtt    = require('./mqtt');
num     = require('./num');
xbee    = require('./xbee');

update = new (require('./update'))();


// Global init
async function init() {
	log.msg('Initializing');

	// console.dir(process.argv, { depth : null, showHidden : true });

	// Configure term event listeners
	process.on('SIGTERM', async () => {
		console.log('');
		log.msg('Caught SIGTERM :: terminating = ' + terminating);

		if (terminating === true) return;
		await term();
	});

	process.on('SIGINT', async () => {
		console.log('');
		log.msg('Caught SIGINT :: terminating = ' + terminating);

		if (terminating === true) return;
		await term();
	});


	// Read JSON config and status files
	await json.read();

	// Start Home Assistant interface
	await hass.init();

	// Start MQTT client
	await mqtt.init();

	// Start XBee interface
	await xbee.init();

	// Start Express API server
	await api.init();

	// Update Home Assistant device registry
	// hass.updateDeviceRegistry();

	log.msg('Initialized');
} // async init()

// Global term
async function term() {
	terminating = true;

	log.msg('Terminating');

	// Terminate Express API server
	await api.term();

	// Terminate XBee interface
	await xbee.term();

	// Terminate MQTT client
	await mqtt.term();

	// Terminate Home Assistant interface
	await hass.term();

	// Write JSON config and status files, and clear save interval
	await json.write('term');

	log.msg('Terminated');
} // async term()


// FASTEN SEATBELTS
(async () => { await init(); })();
