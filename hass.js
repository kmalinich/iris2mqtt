// https://www.npmjs.com/package/homeassistant

let homeAssistant;


async function fireKeypadEvent(keypadData) {
	const eventName = 'keypad_entry';

	try {
		log.lib('Firing Home Assistant event', eventName);

		const eventFireReturn = await homeAssistant.events.fire(eventName, keypadData);

		log.lib('Fired Home Assistant event', eventName);
		return eventFireReturn;
	}
	catch (homeAssistantEventFireError) {
		log.error('fireKeypadEvent() homeAssistantEventFireError', homeAssistantEventFireError);
		return false;
	}
}


async function getHassData() {
	const hassData = {
		config        : null,
		discoveryInfo : null,
		status        : null,
	};

	try {
		hassData.config = await homeAssistant.config();
	}
	catch (configError) {
		console.dir({ configError });
	}

	try {
		hassData.discoveryInfo = await homeAssistant.discoveryInfo();
	}
	catch (discoveryInfoError) {
		console.dir({ discoveryInfoError });
	}

	try {
		hassData.status = await homeAssistant.status();
	}
	catch (statusError) {
		console.dir({ statusError });
	}


	return hassData;
}


async function getState(entityId) {
	try {
		const entityIdParts = entityId.split('.');

		const domain = entityIdParts[0];
		const entity = entityIdParts[1];

		log.lib(`Getting state for ${domain}.${entity}`);

		const state = homeAssistant.states.get(domain, entity);

		return state;
	}
	catch (homeAssistantGetStateError) {
		log.error('getState() homeAssistantGetStateError', homeAssistantGetStateError);
		return false;
	}
}


function generateDeviceRegistryEntry(remote64, entryType) {
	const deviceStatus = status.xbee.nodes64[remote64];

	const entryTypeData = {
		uniqueId : {
			deviceName : deviceStatus.name.toLowerCase().replace(/\s+/g, '').replace('\'', ''),
			nodeName   : entryType.toLowerCase().replace(/\s+/g, '').replace('\'', ''),
		},

		name              : '',
		deviceClass       : '',
		icon              : '',
		unitOfMeasurement : '',
	};


	let entityType = 'sensor';

	switch (entryType) {
		case 'activePower' : {
			entryTypeData.name        = 'active power';
			entryTypeData.deviceClass = 'power';
			entryTypeData.unitOfMeasurement = 'W';
			break;
		}

		case 'batteryLevel' : {
			entryTypeData.name        = 'battery level';
			entryTypeData.deviceClass = 'battery';
			entryTypeData.unitOfMeasurement = '%';
			break;
		}

		case 'batteryVoltage' : {
			entryTypeData.name        = 'battery voltage';
			entryTypeData.deviceClass = 'voltage';
			entryTypeData.unitOfMeasurement = 'V';
			break;
		}

		case 'buttonState' : {
			entityType = 'binary_sensor';
			entryTypeData.name = 'button';
			break;
		}

		case 'contactState' : {
			entityType = 'binary_sensor';
			entryTypeData.name = 'door';
			entryTypeData.deviceClass = 'door';
			break;
		}

		case 'motionState' : {
			entityType = 'binary_sensor';
			entryTypeData.name = 'motion';
			entryTypeData.deviceClass = 'motion';
			break;
		}

		case 'motionValue' : {
			entryTypeData.name = 'motion value';
			entryTypeData.icon = 'mdi:motion-sensor';
			entryTypeData.unitOfMeasurement = '%';
			break;
		}

		case 'rssi' : {
			entryTypeData.name        = entryType.toUpperCase();
			entryTypeData.deviceClass = 'signal_strength';
			entryTypeData.unitOfMeasurement = 'dBm';
			break;
		}

		case 'switchState' : {
			entityType = 'switch';
			entryTypeData.name = 'switch';
			entryTypeData.icon = 'mdi:power-socket-us';
			break;
		}

		case 'temperature' : {
			entryTypeData.name        = entryType;
			entryTypeData.deviceClass = entryType;
			entryTypeData.unitOfMeasurement = '°C';
			break;
		}
	} // switch (entryType)


	const deviceRegistryEntry = {
		unique_id : `${remote64}-${entryTypeData.uniqueId.deviceName}-${entryTypeData.uniqueId.nodeName}`,
		name      : `${deviceStatus.name} ${entryTypeData.name}`,

		availability_topic : `tele/${remote64}/LWT`,
		state_topic        : `stat/${remote64}/${entryType}`,

		icon : entryTypeData.icon,

		unit_of_measurement : entryTypeData.unitOfMeasurement,

		device_class : entryTypeData.deviceClass,
		state_class  : 'measurement',

		device : {
			identifiers : remote64,
			// connections : [
			// 	[ 'remote64', status.xbee.self.addr64 ],
			// ],

			manufacturer : deviceStatus.make,
			model        : deviceStatus.model,
			name         : deviceStatus.name,
			sw_version   : deviceStatus.buildDate,
		},
	};

	if (entryType === 'switchState') {
		deviceRegistryEntry.command_topic = `cmnd/${remote64}/${entryType}`;
	}


	if (deviceRegistryEntry.name.includes('button button')) {
		deviceRegistryEntry.name = deviceRegistryEntry.name.replace('button button', 'button');
	}

	if (deviceRegistryEntry.name.includes('motion sensor motion')) {
		deviceRegistryEntry.name = deviceRegistryEntry.name.replace('motion sensor motion', 'motion');
	}

	if (deviceRegistryEntry.name.includes('door sensor door')) {
		deviceRegistryEntry.name = deviceRegistryEntry.name.replace('door sensor door', 'door');
	}

	if (deviceRegistryEntry.device_class        === '') delete deviceRegistryEntry.device_class;
	if (deviceRegistryEntry.icon                === '') delete deviceRegistryEntry.icon;
	if (deviceRegistryEntry.unit_of_measurement === '') delete deviceRegistryEntry.unit_of_measurement;

	if (entityType !== 'sensor') delete deviceRegistryEntry.state_class;

	mqtt.pub(`homeassistant/${entityType}/${deviceRegistryEntry.unique_id}/config`, deviceRegistryEntry, true);

	return deviceRegistryEntry;
} // generateDeviceRegistryEntry(remote64, entryType)

async function updateDeviceRegistry() {
	for await (const remote64 of Object.keys(status.xbee.nodes64)) {
		const device = status.xbee.nodes64[remote64];

		generateDeviceRegistryEntry(remote64, 'rssi');

		switch (device.model) {
			case 'Button Device'         :
			case 'Contact Sensor Device' :
			case 'PIR Device'            : {
				generateDeviceRegistryEntry(remote64, 'batteryLevel');
				generateDeviceRegistryEntry(remote64, 'batteryVoltage');
				generateDeviceRegistryEntry(remote64, 'temperature');
			}
		}

		switch (device.model) {
			case 'Button Device' : {
				generateDeviceRegistryEntry(remote64, 'buttonState');
				break;
			}

			case 'Contact Sensor Device' : {
				generateDeviceRegistryEntry(remote64, 'contactState');
				break;
			}

			case 'KeyPad Device' : {
				break;
			}

			case 'Keyfob Device' : {
				break;
			}

			case 'PIR Device' : {
				generateDeviceRegistryEntry(remote64, 'motionValue');
				generateDeviceRegistryEntry(remote64, 'motionState');
				break;
			}

			case 'SmartPlug2.5' : {
				generateDeviceRegistryEntry(remote64, 'activePower');
				generateDeviceRegistryEntry(remote64, 'switchState');
				break;
			}
		}
	} // for await (const remote64 of Object.keys(status.xbee.nodes64))
} // async updateDeviceRegistry()


async function init() {
	log.lib('Initializing');

	try {
		log.lib('Connecting to Home Assistant');
		homeAssistant = new (require('homeassistant'))(config.homeassistant);
		log.lib('Connected to Home Assistant');
	}
	catch (homeAssistantConnectError) {
		log.error('init() homeAssistantConnectError', homeAssistantConnectError);
		return false;
	}

	log.lib('Initialized');
} // async init()


async function term() {
	log.lib('Terminating');

	log.lib('Terminated');
} // async term()


module.exports = {
	fireKeypadEvent,
	getHassData,
	getState,

	generateDeviceRegistryEntry,
	updateDeviceRegistry,

	// Start/stop functions
	init,
	term,
};
