const write_options = { spaces : '\t' };

const defaults = require('defaults-deep');
const jsonfile = require('jsonfile');

const file_config = './config.json';
const file_status = './status.json';

const config_default = require('./config-default');
const status_default = require('./status-default');

let saveInterval;


// Read config+status
async function read(skipInterval = false) {
	// Read JSON config+status files
	await readConfig();
	await readStatus();

	if (skipInterval === true) return;

	log.lib('Set 5 minute data save interval');
	saveInterval = setInterval(write, (5 * 60 * 1000));
}

// Write config+status
async function write(param = null) {
	// Write JSON config+status files
	await writeConfig();
	await writeStatus();

	if (param === 'term') clearInterval(saveInterval);
}


// Read config JSON
async function readConfig() {
	let config_data;

	try {
		config_data = await jsonfile.readFileSync(file_config);
	}
	catch (error) {
		log.lib('Failed reading config, applying default config');
		// log.error(error);

		config = config_default;
		await writeConfig();
		return false;
	}

	// Lay the default values on top of the read object, in case new values were added
	config = await defaults(config_data, config_default);

	log.lib('Read config');
}

// Read status JSON
async function readStatus() {
	let status_data;

	try {
		status_data = await jsonfile.readFileSync(file_status);
	}
	catch (error) {
		log.lib('Failed reading status, applying default status');
		// log.error(error);

		status = status_default;
		await writeStatus();
		return false;
	}

	// Lay the default values on top of the read object, in case new values were added
	status = await defaults(status_data, status_default);

	log.lib('Read status');
}


// Write config JSON
async function writeConfig() {
	// Don't write if empty
	if (typeof config.mqtt === 'undefined') {
		log.lib('Failed writing config, config object empty');
		return;
	}

	try {
		await jsonfile.writeFileSync(file_config, config, write_options);
	}
	catch (error) {
		log.lib('Failed writing config');
		log.error(error);
		return false;
	}

	log.lib('Wrote config');
}

// Write status JSON
async function writeStatus() {
	// Don't write if empty
	if (typeof status.xbee === 'undefined') {
		log.lib('Failed writing status, status object empty');
		return;
	}

	try {
		await jsonfile.writeFileSync(file_status, status, write_options);
	}
	catch (error) {
		log.lib('Failed writing status');
		log.error(error);
		return false;
	}

	log.lib('Wrote status');
}


module.exports = {
	readConfig,
	writeConfig,

	readStatus,
	writeStatus,

	read,
	write,
};
