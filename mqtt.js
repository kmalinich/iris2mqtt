/* eslint no-console : 0 */

const mqtt = require('async-mqtt');

let client;


// Data sender
async function pub(topic, data = null, retain = false) {
	// We're bout to get outta here
	if (terminating === true) {
		log.lib(`[PUB ] Topic: '${topic}', terminating = true, bailing`);
		return;
	}

	// Client not here yet - wait a sec
	if (typeof client === 'undefined' || client === null || typeof client.connected === 'undefined' || client.connected !== true) {
		log.lib(`[PUB ] Topic: '${topic}', not connected to server yet, waiting 5s and trying again`);

		return setTimeout(async () => {
			await pub(topic, data, retain);
		}, 5000);
	}

	// if (topic.includes('homeassistant')) {
	// 	log.lib('[PUB ]', { topic, data });
	// }

	// Format data blob
	switch (typeof data) {
		case 'boolean' : {
			switch (Number(data)) {
				case 0  : data = 'OFF'; break;
				case 1  : data = 'ON';  break;
				default : data = 'UNKNOWN';
			}
			break;
		}

		case 'number' : data = data.toString();      break;
		case 'object' : data = JSON.stringify(data); break;
	}

	const publishOptions = {
		dup : false,
		qos : 0,
		retain,
	};

	// Turns out, this is kind of spammy
	// log.msg('pub()', { topic, data, retain });
	try {
		// Publish message
		await client.publish(topic, data, publishOptions);
	}
	catch (clientPublishError) {
		log.error('pub(): clientPublishError', clientPublishError);
		log.error('pub(): clientPublishArgs', { topic, data, publishOptions });
	}
} // async pub(topic, data = null, retain = false)


function router(topic, message) {
	if (topic === 'homeassistant/status') {
		return hass.updateDeviceRegistry();
	}

	message = message.toString();

	const topicData = topic.split('/');

	// Bounce if invalid message
	if (typeof topicData[0] === 'undefined') return;
	if (typeof topicData[1] === 'undefined') return;
	if (typeof topicData[2] === 'undefined') return;

	// log.lib('router()', { topic, message });

	switch (topicData[0]) {
		case 'cmnd' : return processCmnd(topic, message);
		case 'stat' : return processStat(topic, message);
	}
} // router(topic, message)


// 'cmnd' data handler
async function processCmnd(topic, message) {
	message = message.toString();

	const topicData = topic.split('/');

	// Bounce if invalid message
	if (typeof topicData[0] === 'undefined') return;
	if (typeof topicData[1] === 'undefined') return;
	if (typeof topicData[2] === 'undefined') return;

	log.lib('processCmnd()', { topic, message });

	switch (topicData[2]) {
		case 'switchState' : {
			// await xbee.sendMessage('switchStateRequest', { switchState : 'check' }, topicData[1]);
			await xbee.sendMessage('switchStateRequest', { switchState : message }, topicData[1]);
			break;
		}
	}
} // async processCmnd(topic, message)

// 'stat' data handler
function processStat(topic, message) {
	message = message.toString();

	const topicData = topic.split('/');

	// Bounce if invalid message
	if (typeof topicData[0] === 'undefined') return;
	if (typeof topicData[1] === 'undefined') return;
	if (typeof topicData[2] === 'undefined') return;

	log.lib('[STAT] topic: \'' + topic + '\', message: ' + message);
} // processStat(topic, message)


async function init() {
	log.lib('Initializing');

	try {
		client = await mqtt.connectAsync('mqtt://' + config.mqtt.server, {
			clientId : config.mqtt.clientId,
		});

		mqtt.clientConnected = true;
	}
	catch (clientConnectError) {
		log.error('init(): clientConnectError', clientConnectError);
		process.exit(1);
	}


	log.lib('Connected to server');
	// cmnd - prefix to issue commands; ask for status
	// stat - reports back status or configuration message


	client.on('connect', () => {
		log.lib('event: \'connect\'');
	});

	client.on('reconnect', () => {
		log.lib('event: \'reconnect\'');
	});

	client.on('close', () => {
		log.lib('event: \'close\'');
	});

	client.on('message', router);


	// Subscribe to 'cmnd' messages
	await client.subscribe('cmnd/+/#');
	await client.subscribe('homeassistant/status');


	// action_topic : "stat/tstat-02/ACTION"
	//
	// aux_command_topic : "cmnd/tstat-02/AUX"
	// aux_state_topic   : "stat/tstat-02/AUX"
	//
	// availability_topic : "tele/tstat-02/LWT"
	//
	// current_temperature_topic : "stat/tstat-02/UPSTAIRS"
	//
	// fan_mode_command_topic : "cmnd/tstat-02/FAN"
	// fan_mode_state_topic   : "stat/tstat-02/FAN"
	//
	// mode_command_topic : "cmnd/tstat-02/MODE"
	// mode_state_topic   : "stat/tstat-02/MODE"
	//
	// temperature_command_topic : "cmnd/tstat-02/TARGET"
	// temperature_state_topic   : "stat/tstat-02/TARGET"


	await pub('tele/' + config.mqtt.clientId + '/LWT', 'online', true);

	log.lib('Initialized');
} // async init()

async function term() {
	log.lib('Terminating');

	await pub('tele/' + config.mqtt.clientId + '/LWT', 'offline', true);

	if (typeof client !== 'undefined') {
		if (typeof client.end === 'function') {
			try {
				log.lib('Ending client');
				await client.end();

				mqtt.clientConnected = false;
				log.lib('Ended client');
			}
			catch (clientEndError) {
				log.error('term(): clientEndError', clientEndError);
			}
		}
	}

	log.lib('Terminated');
} // async term()


module.exports = {
	clientConnected : false,

	init,
	term,
	pub,
};
