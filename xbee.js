const SerialPort = require('serialport');
const xbee_api   = require('xbee-api');
const clone      = require('rfdc')();

const motionTimeoutSec = 180;

const batteryMinVoltage = 2.0;
const batteryMaxVoltage = 3.28;


let serialport;
let xbeeAPI;

const addr64List = [ null, null ];


// Zigbee addressing
// const BROADCAST_LONG  = [ 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF ];
// const BROADCAST_SHORT = [ 0xFF, 0xFE ];


// Zigbee profile IDs
const PROFILE_ID_ALERTME = 'c216'; // AlertMe device profile
const PROFILE_ID_HA      = '0104'; // HA device profile
const PROFILE_ID_LL      = 'c05e'; // Light link Profile
const PROFILE_ID_ZDP     = '0000'; // Zigbee device profile


// Zigbee endpoints
const ENDPOINT_ALERTME = '02'; // AlertMe/Iris endpoint
const ENDPOINT_ZDO     = '00'; // Zigbee device objects endpoint


const endpointList = [ ENDPOINT_ZDO, ENDPOINT_ALERTME ];


// ZDP status
const ZDP_STATUS = {
	OK        : 0x00,
	INVALID   : 0x80,
	NOT_FOUND : 0x81,
};


// Cluster IDs
const CLUSTER_ID = {
	// AlertMe cluster IDs
	// http://www.desert-home.com/2015/06/hacking-into-iris-door-sensor-part-4.html
	AM : {
		ATTRIBUTE : '00c0', // Attribute
		BUTTON    : '00f3', // Button/keyfob
		DISCOVERY : '00f6', // Device discovery
		POWER     : '00ef', // Power information
		SECURITY  : '0500', // Security
		STATUS    : '00f0', // Device status
		SWITCH    : '00ee', // SmartPlug switch
		TAMPER    : '00f2', // Device tamper
	}, // AM

	// ZDO cluster IDs
	// http://ftp1.digi.com/support/images/APP_NOTE_XBee_Zigbee_Device_Profile.pdf
	ZDO : {
		ACTIVE_ENDPOINT : {
			REQUEST  : '0005', // Active endpoint request
			RESPONSE : '8005', // Active endpoint response
		},

		END_DEVICE_ANNOUNCE : '0013', // End device announce

		MANAGEMENT_ROUTING : {
			REQUEST  : '0032', // Management routing request
			RESPONSE : '8032', // Management routing response
		},

		MATCH_DESCRIPTOR : {
			REQUEST  : '0006', // Match descriptor request
			RESPONSE : '8006', // Match descriptor response
		},

		NETWORK_ADDRESS : {
			REQUEST  : '0000', // Network address (16-bit) request
			RESPONSE : '8000', // Network address (16-bit) response
		},

		PERMIT_JOINING : {
			REQUEST  : '0036', // Permit joining request
			RESPONSE : '8036', // Permit joining response
		},

		SIMPLE_DESC_REQ : '0004', // Simple descriptor request
	}, // ZDO
}; // CLUSTER_ID

// Cluster commands
const CLUSTER_CMD = {
	// AlertMe
	AM : {
		// Security IasZoneCluster commands cluster 0x500 = 1280
		SEC_ENROLL_REQ    : '01',
		SEC_STATUS_CHANGE : '00', // Security event (sensors)

		// AmGeneralCluster commands cluster [ 0x00, 0xF0 ] : 240
		LIFESIGN_CMD     : 'fb', // LIFESIGN_CMD     : 251
		RTC_CMD_REQ      : '80', // REQUEST_RTC_CMD  : 128
		SET_MODE_CMD     : 'fa', // SET_MODE_CMD     : 250
		SET_RTC_CMD      : '00', // SET_RTC_CMD      : 0
		STOP_POLLING_CMD : 'fd', // STOP_POLLING_CMD : 253

		// AmPowerCtrlCluster commands cluster [ 0x00, 0xEE ] : 238
		STATE_REQ        : '01', // CMD_SET_OPERATING_MODE : 1 // State request (SmartPlug)
		STATE_CHANGE     : '02', // CMD_SET_RELAY_STATE    : 2 // State change request (SmartPlug)
		STATE_REPORT_REQ : '03', // CMD_REQUEST_REPORT     : 3
		STATE_RESP       : '80', // CMD_STATUS_REPORT      : 128 // switch status update

		// AmPowerMonCluster commands cluster [ 0x00, 0xEF ] : 239
		POWER_SET_REPT_PARAMS : '00', // CMD_SET_REPT_PARAMS : 0
		POWER_REQUEST_REPORT  : '03', // CMD_REQUEST_REPORT  : 3
		POWER_SET_REPORT_RATE : '04', // CMD_SET_REPORT_RATE : 4
		POWER_DEMAND          : '81', // CMD_POWER_REPORT    : 129 // Power demand update
		POWER_CONSUMPTION     : '82', // CMD_ENERGY_REPORT   : 130 // Power consumption & uptime update

		PWD_BATCH_POWER_REPORT        : '84', // CMD_BATCH_POWER_REPORT        : 132
		PWD_BATCH_ENERGY_REPORT       : '85', // CMD_BATCH_ENERGY_REPORT       : 133
		PWD_POWER_ENERGY_REPORT       : '86', // CMD_POWER_ENERGY_REPORT       : 134
		PWD_BATCH_POWER_ENERGY_REPORT : '87', // CMD_BATCH_POWER_ENERGY_REPORT : 135

		POWER_UNKNOWN : '86', // Unknown British Gas power meter update

		// AmMaintenanceCluster commands cluster [ 0x00, 0xF6 ] : 246
		MAINT_HELLO_REQ  : 'fc', // HELLO_WORLD_REQ  : 252
		MAINT_HELLO_RESP : 'fe', // HELLO_WORLD_RESP : 254

		MAINT_RANGE_TEST_REQ  : 'fd', // RANGE_TEST_SEND_CMD : 253
		MAINT_RANGE_TEST_RESP : 'fd', // RANGE_TEST_RECV_CMD : 253

		MODE_REQ     : 'fa',  // Mode change request
		STATUS       : 'fb',  // Status update
		VERSION_REQ  : 'fc',  // Version information request
		RSSI         : 'fd',  // RSSI range test update
		VERSION_RESP : 'fe',  // Version information response
	}, // AM
}; // CLUSTER_CMD


// AlertMe device modes
const DEVICE_MODE = {
	IDLE          : 0x04,
	LOCKED        : 0x02,
	NORMAL_OPS    : 0x00,
	OPT_CLEAR_HNF : 0x02,
	OPT_NONE      : 0x00,
	OPT_SET_HNF   : 0x01,
	QUIESCENT     : 0x05,
	RANGE_TEST    : 0x01,
	SEEKING       : 0x03,
	SILENT        : 0x03,
	TEST          : 0x02,
};


// Utilized by generateMessage()
const messages = {
	activeEndpointRequest : {
		name  : 'Active endpoint request',
		frame : {
			profileId           : PROFILE_ID_ZDP,
			clusterId           : CLUSTER_ID.ZDO.ACTIVE_ENDPOINT.REQUEST,
			sourceEndpoint      : ENDPOINT_ZDO,
			destinationEndpoint : ENDPOINT_ZDO,
			dataGenerate        : (params) => generateActiveEndpointRequest(params),
			data                : [ ],
		},
	},

	matchDescriptorRequest : {
		name  : 'Match descriptor request',
		frame : {
			profileId           : PROFILE_ID_ZDP,
			clusterId           : CLUSTER_ID.ZDO.MATCH_DESCRIPTOR.REQUEST,
			sourceEndpoint      : ENDPOINT_ZDO,
			destinationEndpoint : ENDPOINT_ZDO,
			dataGenerate        : (params) => generateMatchDescriptorRequest(params),
			data                : [ ],
		},
	},

	matchDescriptorResponse : {
		name  : 'Match descriptor response',
		frame : {
			profileId           : PROFILE_ID_ZDP,
			clusterId           : CLUSTER_ID.ZDO.MATCH_DESCRIPTOR.RESPONSE,
			sourceEndpoint      : ENDPOINT_ZDO,
			destinationEndpoint : ENDPOINT_ZDO,
			dataGenerate        : (params) => generateMatchDescriptorResponse(params),
			data                : [ ],
		},
	},


	modeChangeRequest : {
		name  : 'Mode change request',
		frame : {
			profileId           : PROFILE_ID_ALERTME,
			clusterId           : CLUSTER_ID.AM.STATUS,
			sourceEndpoint      : ENDPOINT_ALERTME,
			destinationEndpoint : ENDPOINT_ALERTME,
			dataGenerate        : (params) => generateModeChangeRequest(params),
			data                : [ ],
		},
	},

	permitJoinRequest : {
		name  : 'Management permit join request',
		frame : {
			profileId           : PROFILE_ID_ZDP,
			clusterId           : CLUSTER_ID.ZDO.PERMIT_JOINING.REQUEST,
			sourceEndpoint      : ENDPOINT_ZDO,
			destinationEndpoint : ENDPOINT_ZDO,
			data                : [ 0xFF, 0x00 ],
		},
	},

	routingTableRequest : {
		name  : 'Management routing table request',
		frame : {
			profileId           : PROFILE_ID_ZDP,
			clusterId           : CLUSTER_ID.ZDO.MANAGEMENT_ROUTING.REQUEST,
			sourceEndpoint      : ENDPOINT_ZDO,
			destinationEndpoint : ENDPOINT_ZDO,
			data                : [ 0x12, 0x01 ],
		},
	},

	securityInit : {
		name  : 'Security initialization',
		frame : {
			profileId           : PROFILE_ID_ALERTME,
			clusterId           : CLUSTER_ID.AM.SECURITY,
			sourceEndpoint      : ENDPOINT_ALERTME,
			destinationEndpoint : ENDPOINT_ALERTME,
			dataGenerate        : () => generateSecurityInit(),
			data                : [ ],
		},
	},

	switchStateRequest : {
		name  : 'Switch state request',
		frame : {
			profileId           : PROFILE_ID_ALERTME,
			clusterId           : CLUSTER_ID.AM.SWITCH,
			sourceEndpoint      : ENDPOINT_ZDO,
			destinationEndpoint : ENDPOINT_ALERTME,
			dataGenerate        : (params) => generateSwitchStateRequest(params),
			data                : [ ],
		},
	},

	versionInfoRequest : {
		name  : 'Version info request',
		frame : {
			profileId           : PROFILE_ID_ALERTME,
			clusterId           : CLUSTER_ID.AM.DISCOVERY,
			sourceEndpoint      : ENDPOINT_ZDO,
			destinationEndpoint : ENDPOINT_ALERTME,
			dataGenerate        : (params) => generateVersionInfoRequest(params),
			data                : [ ],
		},
	},
}; // messages


// Issue AT commands to find addresses of connected XBee device
async function readAddresses() {
	await sendATCommand('MY');
	await sendATCommand('SH');
	await sendATCommand('SL');
} // async readAddresses()


function generateActiveEndpointRequest(params) {
	// The active endpoint request needs the short address of the device in the payload
	//
	// It needs to be little endian (backwards)
	//
	// The first byte in the payload is simply a number to identify the message
	// The response will have the same number in it

	// Field name       Size  Description
	// ----------       ----  -----------
	// Sequence         1     Frame sequence
	// Network address  2     16-bit address of a device in the network whose active endpoint list being requested

	// :param params:
	// :return: Message data

	// Example: [ 0xAA, 0x9F, 0x88 ]

	// TODO
	const netAddr = [ Buffer.from(params.remote16, 'hex')[0], Buffer.from(params.remote16, 'hex')[1] ];

	const data = [ params.zdoSequenceNumber ].concat(netAddr);

	log.msg('generateActiveEndpointRequest()', { params, netAddr, data });

	return data;
} // generateActiveEndpointRequest(params)

function generateMatchDescriptorRequest(params) {
	log.msg('generateMatchDescriptorRequest()', params);

	// params:
	//   - inClusters
	//   - outClusters
	//   - profileId
	//   - remote16
	//   - zdoSequenceNumber

	// Broadcast or unicast transmission used to discover the device(s) that supports a specified profile ID and/or clusters

	// Field name                 Size  Description
	// ----------                 ----  -----------
	// Sequence                   1     Frame sequence
	// Network address            2     16-bit address of a device in the network whose power descriptor is being requested
	// Profile ID                 2     Profile ID to be matched at the destination
	// Number of input clusters   1     The number of input clusters in the in cluster list for matching. Set to 0 if no clusters supplied
	// Input cluster list         2*    List of input cluster IDs to be used for matching
	// Number of output clusters  1     The number of output clusters in the output cluster list for matching. Set to 0 if no clusters supplied
	// Output cluster list        2*    List of output cluster IDs to be used for matching
	//                                  * Number of Input Clusters

	// Example: [ 0x01, 0xFD, 0xFF, 0x16, 0xC2, 0x00, 0x01, 0xF0, 0x00 ]

	// :param params:
	// :return: Message data
	const netAddr     = [ Buffer.from(params.remote16, 'hex')[0],  Buffer.from(params.remote16, 'hex')[1]  ]; // 0xFD, 0xFF
	const profileId   = [ Buffer.from(params.profileId, 'hex')[1], Buffer.from(params.profileId, 'hex')[0] ]; // 0x16, 0xC2  PROFILE_ID_ALERTME (reversed)

	// TODO: Finish this off! At the moment this does not support multiple clusters, it just supports one!

	const data = [ params.zdoSequenceNumber ].concat(netAddr).concat(profileId).concat(params.inClusters.length).concat(params.inClusters).concat(params.outClusters.length).concat(params.outClusters[1]).concat(params.outClusters[0]);
	return data;
} // generateMatchDescriptorRequest(params)

function generateMatchDescriptorResponse(params) {
	// If a descriptor match is found on the device, this response contains a list of endpoints that support the request criteria
	//
	// Field Name       Size      Description
	// ----------       ----      -----------
	// Sequence         1         Frame sequence
	// Status           1         Response status
	// Network Address  2         Indicates the 16-bit address of the responding device
	// Length           1         The number of endpoints on the remote device that match the request criteria
	// Match List       Variable  List of endpoints on the remote that match the request criteria
	//
	// Example: [ 0x01, 0x00, 0x00, 0xE1, 0x02, 0x00, 0x02 ]
	//
	// :param params:
	// :return: Message data

	// params:
	//   - remote16
	//   - zdoSequenceNumber

	const responseStatus = ZDP_STATUS.OK; // 0x00

	// TODO
	const netAddr   = [ Buffer.from(params.remote16, 'hex')[0], Buffer.from(params.remote16, 'hex')[1] ];
	const matchList = [ Buffer.from(endpointList[0], 'hex')[0], Buffer.from(endpointList[1], 'hex')[0] ];

	// const data = [ params.zdoSequenceNumber ].concat(responseStatus).concat(netAddr).concat(matchList.length).concat(matchList);
	const data = [ params.zdoSequenceNumber, responseStatus, 0x00, 0x00, 0x01, 0x02 ];

	log.msg('generateMatchDescriptorResponse()', {
		params,
		responseStatus,
		netAddr,
		matchList,
		data,
	});

	return data;
} // generateMatchDescriptorResponse(params)


function generateModeChangeRequest(params = null) {
	// Available modes:
	// idle
	// locked
	// normal
	// rangeTest
	// silent

	// Field name       Size  Description
	// ----------       ----  -----------
	// Preamble         2     Unknown preamble TBC
	// Cluster command  1     Cluster command - mode change request ([ 0xFA ])
	// Mode             2     Requested mode (1: Normal, 257: Range Test, 513: Locked, 769: Silent)

	// :param params: Object of requested mode
	// :return: Message data
	const preamble   = [ 0x11, 0x00 ];
	// const preamble   = [ 0x19, 0x41 ];
	const clusterCmd = Buffer.from(CLUSTER_CMD.AM.MODE_REQ, 'hex')[0]; // TODO: Flip this around so there's one Buffer.from() in parseMessage

	// Default normal if no mode
	let mode    = 'normal';
	let payload = DEVICE_MODE.NORMAL_OPS;

	if (typeof params === 'object' && typeof params.mode === 'string') {
		mode = params.mode;
	}

	switch (mode) {
		case 'idle'      : payload = DEVICE_MODE.IDLE;       break;
		case 'locked'    : payload = DEVICE_MODE.LOCKED;     break;
		case 'normal'    : payload = DEVICE_MODE.NORMAL_OPS; break;
		case 'rangeTest' : payload = DEVICE_MODE.RANGE_TEST; break;
		case 'silent'    : payload = DEVICE_MODE.SILENT;     break;

		default : {
			log.error('generateModeChangeRequest(): invalid mode', mode);
			return [];
		}
	}

	const data = preamble.concat(clusterCmd).concat([ payload, 0x01 ]);

	log.msg('generateModeChangeRequest()', { params, data });

	return data;
} // generateModeChangeRequest(params)

function generateSecurityInit() {
	// Keeps security devices joined?

	// Field name       Size  Description
	// ----------       ----  -----------
	// Preamble         2     Unknown preamble TBC              ([ 0x11, 0x80 ])
	// Cluster command  1     Cluster command - Security event  ([ 0x00 ])
	// Unknown          2     ???                               ([ 0x00, 0x05 ])

	// :param params: Object (none required)
	// :return: Message data
	const preamble   = [ 0x11, 0x80 ];
	const clusterCmd = Buffer.from(CLUSTER_CMD.AM.SEC_STATUS_CHANGE, 'hex')[0]; // TODO: Flip this around so there's one Buffer.from() in parseMessage
	const payload    = [ 0x00, 0x05 ];

	const data = preamble.concat(clusterCmd).concat(payload);

	log.msg('generateSecurityInit()', { data });

	return data;
} // generateSecurityInit()

function generateSwitchStateRequest(params = { switchState : 'check' }) {
	log.msg('generateSwitchStateRequest()', { params });

	// This message is sent FROM the Hub TO the SmartPlug requesting state change

	// Field name             Size  Description
	// ----------             ----  -----------
	// Preamble               2     Unknown preamble TBC
	// Cluster command        1     Cluster command - Change state (SmartPlug) ([ 0x01 ] / [ 0x02 ])
	// Requested relay state  2*    [ 0x01 ] = Check Only, [ 0x01, 0x01 ] = On, [ 0x00, 0x01 ] = Off
	//                        * Size = 1 if check only

	// :param params: Object of switch relay state
	// :return: Message data
	const preamble = [ 0x11, 0x00 ];

	let clusterCmd;
	let payload;

	if (typeof params.switchState === 'undefined') params.switchState = 'check';
	if (params.switchState        === null)        params.switchState = 'check';
	if (params.switchState        === '')          params.switchState = 'check';

	switch (params.switchState.toString().toLowerCase()) {
		case '1'        :
		case 'active'   :
		case 'activate' :
		case 'on'       :
		case 'poweron'  :
		case 'switchon' :
		case 'true'     :
			params.switchState = 1;

			clusterCmd = CLUSTER_CMD.AM.STATE_CHANGE;
			payload    = [ 0x01, 0x01 ]; // On
			break;

		case '0'          :
		case 'inactive'   :
		case 'deactivate' :
		case 'off'        :
		case 'poweroff'   :
		case 'switchoff'  :
		case 'false'      :
			params.switchState = 0;

			clusterCmd = CLUSTER_CMD.AM.STATE_CHANGE;
			payload    = [ 0x00, 0x01 ]; // Off
			break;

		default :
			// Check only
			params.switchState = 'check';

			clusterCmd = CLUSTER_CMD.AM.STATE_REQ;
			payload    = [ 0x01 ];
	}

	clusterCmd = Buffer.from(clusterCmd, 'hex')[0]; // TODO: Flip this around so there's one Buffer.from() in parseMessage

	const data = preamble.concat(clusterCmd).concat(payload);

	log.msg('generateSwitchStateRequest()', { data });

	return data;
} // generateSwitchStateRequest(params)

function generateVersionInfoRequest() {
	// This message is sent FROM the Hub TO the SmartPlug requesting version information

	// Field name       Size  Description
	// ----------       ----  -----------
	// Preamble         2     Unknown preamble TBC
	// Cluster command  1     Cluster command - version information request ([ 0xFC ])

	// :return: Message data
	const preamble   = [ 0x11, 0x00 ];
	const clusterCmd = Buffer.from(CLUSTER_CMD.AM.VERSION_REQ, 'hex')[0]; // TODO: Flip this around so there's one Buffer.from() in parseMessage

	const data = preamble.concat(clusterCmd);
	return data;
} // generateVersionInfoRequest()


function parseActiveEndpointResponse(data, remote64, nodeName) {
	const activeEndpointResponseState = {};

	log.msg('parseActiveEndpointResponse()', { remote64, nodeName, data, activeEndpointResponseState, error : 'none' });

	return activeEndpointResponseState;
} // parseActiveEndpointResponse(data, remote64, nodeName)

function parseATCommandResponse(frame) {
	switch (frame.command) {
		case 'MY' : update.status('xbee.self.addr16', frame.commandData.toString('hex')); break;

		case 'SH' : addr64List[0] = frame.commandData.toString('hex'); break;
		case 'SL' : addr64List[1] = frame.commandData.toString('hex'); break;
	} // switch (frame.command)

	if (typeof addr64List[0] === 'string' && typeof addr64List[1] === 'string') {
		update.status('xbee.self.addr64', addr64List[0] + addr64List[1]);
	}
} // parseATCommandResponse(frame)

// Messages labeled "attribute" in arcus, sent from Keypad device
function parseAttribute(data) {
	// constants alertme.KeyPad {
	//   const u8 DEVICE_TYPE = 0x1C;
	//
	//   const u8 ATTR_STATE                     = 0x20;
	//   const u8 ATTR_PIN                       = 0x21;
	//   const u8 ATTR_ACTION_KEY_PRESS          = 0x22;
	//   const u8 ATTR_ACTION_KEY_RELEASE        = 0x23;
	//   const u8 ATTR_HUB_POLL_RATE             = 0x24;
	//   const u8 ATTR_SOUNDS_MASK               = 0x25;
	//   const u8 ATTR_SOUND_ID                  = 0x26;
	//   const u8 ATTR_CUSTOM_SOUND              = 0x27;
	//   const u8 ATTR_UNSUCCESSFUL_STATE_CHANGE = 0x27;
	//
	//   const u8 KEYPAD_STATE_UNKNOWN        = 0x00;
	//   const u8 KEYPAD_STATE_HOME           = 0x01;
	//   const u8 KEYPAD_STATE_ARMED          = 0x02;
	//   const u8 KEYPAD_STATE_NIGHT          = 0x03;
	//   const u8 KEYPAD_STATE_PANIC          = 0x04;
	//   const u8 KEYPAD_STATE_ARMING         = 0x05;
	//   const u8 KEYPAD_STATE_ALARMING       = 0x06;
	//   const u8 KEYPAD_STATE_NIGHT_ARMING   = 0x07;
	//   const u8 KEYPAD_STATE_NIGHT_ALARMING = 0x08;
	//
	//   const u8 KEYPAD_STATE_LOCKED_MASK = 0x80;
	//
	//   const u8 ACTION_KEY_POUND = 0x23; // '#'
	//   const u8 ACTION_KEY_HOME  = 0x48; // 'H'
	//   const u8 ACTION_KEY_AWAY  = 0x41; // 'A'
	//   const u8 ACTION_KEY_NIGHT = 0x4E; // 'N'
	//   const u8 ACTION_KEY_PANIC = 0x50; // 'P'
	//
	//   const u8 SOUND_CUSTOM   = 0x00;
	//   const u8 SOUND_KEYCLICK = 0x01;
	//   const u8 SOUND_LOSTHUB  = 0x02;
	//   const u8 SOUND_ARMING   = 0x03;
	//   const u8 SOUND_ARMED    = 0x04;
	//   const u8 SOUND_HOME     = 0x05;
	//   const u8 SOUND_NIGHT    = 0x06;
	//   const u8 SOUND_ALARM    = 0x07;
	//   const u8 SOUND_PANIC    = 0x08;
	//   const u8 SOUND_BADPIN   = 0x09;
	//   const u8 SOUND_OPENDOOR = 0x0A;
	//   const u8 SOUND_LOCKED   = 0x0B;
	// }


	// PIN length seems to be limited to 15 digits in hardware
	//
	// Examples from logs
	//
	// Periodic messages
	// <Buffer 08 33 0a 22 00 09 00 48 23 00 09 00 48>
	// <Buffer 08 34 0a 23 00 09 00 48>
	// <Buffer 08 4a 00 20 00>

	// Pressing 'OFF' button
	// <Buffer 08 60 00 20 00>
	// <Buffer 08 34 0a 23 00 09 00 48 23 00 09 00 48>
	// <Buffer 08 00 0a 23 00 09 00 48 23 00 09 00 48>

	// Pressing 'ON' button
	// <Buffer 08 34 0a 22 00 09 00 41>
	// <Buffer 08 00 0a 23 00 09 00 41 23 00 09 00 41>

	// Pressing 'PARTIAL' button
	// <Buffer 08 34 0a 22 00 09 00 4e>
	// <Buffer 08 33 0a 22 00 09 00 4e 23 00 09 00 4e>

	// Pressing 'PANIC' button
	// <Buffer 08 34 0a 22 00 09 00 50>
	// <Buffer 08 33 0a 22 00 09 00 50 23 00 09 00 50>


	// Entering 5 4 3 2 1 in succession
	// <Buffer 08 34 0a 21 00 42 05 35 34 33 32 31>
	//
	// Entering 5 6 0 8 5 in succession
	// <Buffer 08 6c 0a 21 00 42 05 35 36 30 38 35>
	//
	// Entering 1 2 3 1 2 3 in succession
	// <Buffer 08 34 0a 21 00 42 06 31 32 33 31 32 33>
	//
	// Entering 16 or more digits on keypad
	// <Buffer 08 34 0a 21 00 42 10 39 34 35 36 31 32 33 34 35 36 37 38 39 39 39 79>
	//
	// Entering 20 digits on keypad (entered 51340722145134072214)
	// [ xbee ] [ MESSAGE ] parseAttribute() {
	//   data: <Buffer 08 34 0a 21 00 42 10 30 37 32 32 31 34 35 31 33 34 30 30 30 30 30 79>,
	//   attributeData: {
	//     pinLength: 15,
	//     pinBuffer: <Buffer 30 37 32 32 31 34 35 31 33 34 30 30 30 30 30>,
	//     pinString: '072214513400000'
	//   }
	// }


	let attributeName = 'unknown';
	const attributeData = {};

	switch (data[2]) {
		case 0x0A : {
			switch (data[3]) {
				case 0x21 : { // ATTR_PIN
					attributeName = 'pinEntry';


					let pinLength = data[6];
					if (pinLength > 15) pinLength = 15;

					const pinBuffer = data.slice(7, (7 + pinLength));
					const pinString = pinBuffer.toString();

					// attributeData[attributeName] = {};
					// attributeData[attributeName].pinLength = pinLength;
					// attributeData[attributeName].pinBuffer = pinBuffer.toJSON().data;
					// attributeData[attributeName].pinString = pinString;
					attributeData[attributeName] = pinString;
					break;
				}

				case 0x22 : { // ATTR_ACTION_KEY_PRESS
					attributeName = 'actionKeyPress';

					let keyName = 'unknown';
					switch (data[7]) {
						case 0x2A : keyName = '*';       break;
						case 0x23 : keyName = '#';       break;
						case 0x48 : keyName = 'on';      break; // ACTION_KEY_HOME  = 0x48; // 'H'
						case 0x41 : keyName = 'off';     break; // ACTION_KEY_AWAY  = 0x41; // 'A'
						case 0x4E : keyName = 'partial'; break; // ACTION_KEY_NIGHT = 0x4E; // 'N'
						case 0x50 : keyName = 'panic';   break; // ACTION_KEY_PANIC = 0x50; // 'P'
					}

					attributeData[attributeName] = keyName;
					break;
				}

				case 0x23 : { // ATTR_ACTION_KEY_RELEASE
					attributeName = 'actionKeyRelease';

					let keyName = 'unknown';
					switch (data[7]) {
						case 0x2A : keyName = '*';       break;
						case 0x23 : keyName = '#';       break;
						case 0x48 : keyName = 'on';      break; // ACTION_KEY_HOME  = 0x48; // 'H'
						case 0x41 : keyName = 'off';     break; // ACTION_KEY_AWAY  = 0x41; // 'A'
						case 0x4E : keyName = 'partial'; break; // ACTION_KEY_NIGHT = 0x4E; // 'N'
						case 0x50 : keyName = 'panic';   break; // ACTION_KEY_PANIC = 0x50; // 'P'
					}

					attributeData[attributeName] = keyName;
					break;
				}

				// ATTR_HUB_POLL_RATE             = 0x24;
				// ATTR_SOUNDS_MASK               = 0x25;
				// ATTR_SOUND_ID                  = 0x26;
				// ATTR_CUSTOM_SOUND              = 0x27;
				// ATTR_UNSUCCESSFUL_STATE_CHANGE = 0x27;
			}

			hass.fireKeypadEvent(attributeData);
			break;
		}
	}


	log.msg('parseAttribute()', { data, attributeData });

	return attributeData;
} // parseAttribute(data)

function parseButtonPress(data) {
	log.msg('parseButtonPress()', data);

	// Process message, parse for button press status

	// Field name       Size  Description
	// ----------       ----  -----------
	// Preamble         1     Unknown preamble TBC              ([ 0x09 ])
	// Cluster command  1     Cluster command - Security event  ([ 0x00 ])
	// Button state     1     Button state                      ([ 0x01 ] = On, [ 0x00 ] = Off)
	// Unknown          1     ???                               ([ 0x00 ])
	// Unknown          1     ???                               ([ 0x01 ], [ 0x02 ])
	// Counter          2     Counter (milliseconds)            ([ 0xBF, 0xC3, 0x12, 0xCA ])
	// Unknown          2     ???                               ([ 0x00, 0x00 ])

	// Examples:
	// [ 0x09, 0x00, 0x00, 0x00, 0x02, 0xBF, 0xC3, 0x00, 0x00 ] { state : 0, counter : 50111 }
	// [ 0x09, 0x00, 0x01, 0x00, 0x01, 0x12, 0xCA, 0x00, 0x00 ] { state : 1, counter : 51730 }

	const attributes = {
		buttonState :  Boolean(data[2]),
		// TODO
		// counter : struct.unpack('<H', data[5:7])[0],
	};

	return attributes;
} // parseButtonPress(data)

// function parseModeChangeRequest(data) {
// 	const modeCmd = data[3];
//
// 	const attributes = {
// 		mode : 'unknown',
// 	};
//
// 	if (data[4] !== 0x01) return attributes;
//
// 	switch (modeCmd) {
// 		case 0x00 : attributes.mode = 'normal'; break; // 0x11, 0x00, 0xFA, 0x00, 0x01
// 		case 0x01 : attributes.mode = 'range';  break; // 0x11, 0x00, 0xFA, 0x01, 0x01
// 		case 0x02 : attributes.mode = 'locked'; break; // 0x11, 0x00, 0xFA, 0x02, 0x01
// 		case 0x03 : attributes.mode = 'silent'; break; // 0x11, 0x00, 0xFA, 0x03, 0x01
// 	}
//
// 	return attributes;
// } // parseModeChangeRequest(data)

function parsePowerConsumption(data) {
	// Process message, parse for power consumption value

	// Field name       Size  Description
	// ----------       ----  -----------
	// Preamble         2     Unknown preamble TBC
	// Cluster command  1     Cluster command - power consumption & uptime update (0x82)
	// Power value      4     Power consumption value (kWh)
	// Up Time          4     Up Time value (seconds)
	// Unknown          1     ???


	// Examples
	// [ 0x09, 0x77, 0x82, 0x2C, 0x4D, 0x4C, 0x00, 0x84, 0xDA, 0x0A, 0x00, 0x00 ]
	// [ 0x09, 0x77, 0x82, 0xA1, 0x0B, 0x4B, 0x00, 0x48, 0xDA, 0x0A, 0x00, 0x00 ]
	//
	// [ 0x09, 0x77, 0x82, 0xBF, 0x0F, 0x0C, 0x00, 0x28, 0xDC, 0x0A, 0x00, 0x00 ]
	// [ 0x09, 0x77, 0x82, 0xBF, 0x0F, 0x0C, 0x00, 0xEC, 0xDB, 0x0A, 0x00, 0x00 ]

	const attributes = {
		kWh    : data.readUInt32LE(3),
		uptime : data.readUInt32LE(7),
	};

	// const attributes = dict(zip(('clusterCmd', 'power_consumption', 'up_time'), struct.unpack('< 2x s I I 1x', data)));


	log.msg('parsePowerConsumption()', data, attributes);

	return attributes;
} // parsePowerConsumption(data)

function parseActivePower(data) {
	// log.msg('parseActivePower()', data);

	// Process message, parse for power demand value

	// Field name       Size  Description
	// ----------       ----  -----------
	// Preamble         2     Unknown preamble TBC
	// Cluster command  1     Cluster command - Power Demand Update ([ 0x81 ])
	// Power value      2     Power Demand value (kW)

	// Examples:
	// [ 0x09, 0x6A, 0x81, 0x00, 0x00 ] { activePower : 0  }
	// [ 0x09, 0x6A, 0x81, 0x16, 0x00 ] { activePower : 22 }
	// [ 0x09, 0x6A, 0x81, 0x00 ]       { activePower : 37 }

	const attributes = {
		// activePower : parseFloat(`${data[3]}.${data[4]}`),
		activePower : data.readUInt16LE(3),
	};

	log.msg('parseActivePower()', data.toJSON().data, attributes);

	return attributes;
} // parseActivePower(data)

function parsePowerUnknown(data) {
	log.msg('parsePowerUnknown()', data);

	// Parse unknown power message seen from British Gas (AlertMe) power monitor
	// Could this be the same or merged with parseActivePower() or parsePowerConsumption()?

	// Field name       Size  Description
	// ----------       ----  -----------
	// Preamble         2     Unknown preamble TBC              ([ 0x09, 0x00 ])
	// Cluster command  1     Cluster command - unknown power   ([ 0x86 ])
	// Unknown          11    TODO Work out what power values this message contains

	// Examples:
	// 	[ 0x09, 0x00, 0x86, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00  = 0
	// 	[ 0x09, 0x00, 0x86, 0x91, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00              = ?
	// 	[ 0x09, 0x00, 0x86, 0x01, 0xC9, 0x02, 0x07, 0x02, 0x00, 0x00, 0x00              = ?

	// TODO
	// let value = struct.unpack('<H', data[3:5])[0]  // TBC
	const value = null;
	return { activePower : value };
} // parsePowerUnknown(data)

function parseRangeInfoUpdate(data) {
	log.msg('parseRangeInfoUpdate()', data);

	// Process message, parse for RSSI range test value

	// Field name       Size  Description
	// ----------       ----  -----------
	// Preamble         2     Unknown preamble TBC
	// Cluster command  1     Cluster command - RSSI range test update ([ 0xFD ])
	// RSSI value       1     RSSI range test value
	// Unknown          1     ???

	const rssi = data[3];
	return { rssi };
} // parseRangeInfoUpdate(data)

// TODO
function parseVersionInfoUpdate(data) {
	log.msg('parseVersionInfoUpdate()', data.toString('hex'));

	// Process message, parse for version information:
	//     Version, Type, Manufacturer, Date

	// Field Name       Size      Description
	// ----------       ----      -----------
	// Preamble         2         Unknown preamble TBC
	// Cluster command  1         Cluster Command - Version Information Response (0xFE)
	// NodeID           2         unsigned short (H)
	// EUI64Str         8         8x Char (8s)
	// mfgID            2         unsigned short (H)
	// DeviceType       2         unsigned short (H)
	// AppRelease       1         unsigned inter (B)
	// AppVersion       1         unsigned inter (B)
	// HWMinor          1         unsigned inter (B)
	// HWMajor          1         unsigned inter (B)
	// Type Info        Variable  Type Information ('AlertMe.com\nSmartPlug\n2013-09-26')

	const attributes = {};

	// TODO
	// attributes['nodeId'],
	// Eui64str,
	// attributes['mfgId'],
	// attributes['deviceType'],
	// attributes['appRelease'],
	// attributes['appVersion'],
	// attributes['hwMinorVersion'],
	// attributes['hwMajorVersion']
	// = struct.unpack('<H8sHHBBBB', data[3:21])

	const stringOffsets = {
		make      : data.slice(21, 22)[0],
		model     : null,
		buildDate : null,
	};

	stringOffsets.model     = data.slice((21 + stringOffsets.make + 1), (22 + stringOffsets.make + 1))[0];
	stringOffsets.buildDate = data.slice((21 + stringOffsets.make + 1 + stringOffsets.model + 1), (22 + stringOffsets.make + 1 + stringOffsets.model + 1))[0];

	attributes.make      = data.slice(22, (22 + stringOffsets.make)).toString();
	attributes.model     = data.slice((22 + stringOffsets.make + 1), (22 + stringOffsets.make + stringOffsets.model + 1)).toString();
	attributes.buildDate = data.slice((22 + stringOffsets.make + 1 + stringOffsets.model + 1), (22 + stringOffsets.make + stringOffsets.model + 1 + stringOffsets.buildDate + 1)).toString();

	return attributes;
} // parseVersionInfoUpdate(data)

function parseSecurityState(data, remote64, nodeName = null) {
	// Process message, parse for security state
	// TODO: Is this the SAME AS parseTamperState!?!

	// Field name       Size  Description
	// ----------       ----  -----------
	// Preamble         1     Unknown preamble TBC              ([ 0x09 ])
	// Cluster command  1     Cluster command - Security event  ([ 0x00 ])
	// Unknown          1     ???                               ([ 0x00 ])
	// Button state     1     Security states bitmask           ([ 0x00, 0x01, 0x04, 0x05 ])
	// Unknown          2     ???                               ([ 0x00, 0x00 ])

	// Examples:
	// [ 0x09, 0x00, 0x00, 0x00, 0x00, 0x00 ] { triggerState : 0,  tamperState : 0 }
	// [ 0x09, 0x00, 0x00, 0x01, 0x00, 0x00 ] { triggerState : 1,  tamperState : 0 }
	// [ 0x09, 0x00, 0x00, 0x04, 0x00, 0x00 ] { triggerState : 0,  tamperState : 1 }
	// [ 0x09, 0x00, 0x00, 0x05, 0x00, 0x00 ] { triggerState : 1,  tamperState : 1 }

	const securityState = {};

	// Old info
	// 1 = Open
	// 2 = Closed

	// From PIR motion sensor
	// data: <Buffer 09 00 01 0d 00 39 10>
	// data: <Buffer 09 c7 01 0d 00 39 10>
	// data: <Buffer 09 e6 01 0d 00 39 10>
	//
	// Oddball:
	// data: <Buffer 09 01 01 0d 00 39 10> ( 0.39)
	// data: <Buffer 09 6e 01 0d 00 39 10> (43.14)

	// const stateBits   = bitmask.check(securityState.securityStateId);
	// const tamperState = stateBits.mask.bit2;
	// securityState.triggerState  = stateBits.mask.bit0;

	// The security states are in byte [3] and is a bitfield:
	//    bit 0 is the magnetic reed switch state
	//    bit 3 is the tamper switch state

	securityState.securityStateId = data[3];

	for (let i = 0; i < data.length; i++) {
		securityState['securityStateValue' + i] = data[i];
	}

	if (typeof status.xbee.nodes64[remote64].model === 'undefined' || status.xbee.nodes64[remote64].model === null) {
		log.msg('parseSecurityState()', { remote64, nodeName, data, securityState, error : 'Missing model name' });
		return securityState;
	}

	if (data[0] !== 0x09) {
		log.msg('parseSecurityState()', { remote64, nodeName, data, securityState, error : 'data[0] !== 0x09' });
		return securityState;
	}


	switch (status.xbee.nodes64[remote64].model) {
		case 'Button Device' : {
			// When a contact sensor broadcasts a state change for the reed switch, data[1] is 0x6E
			const stateBits = bitmask.check(data[3]);
			securityState.tamperState  = Boolean(!stateBits.mask.bit2);
			break;
		}

		case 'Contact Sensor Device' : {
			// When a contact sensor broadcasts a state change for the reed switch, data[1] is 0x6E
			const stateBits = bitmask.check(data[3]);
			securityState.contactState = Boolean(stateBits.mask.bit0);
			securityState.tamperState  = Boolean(!stateBits.mask.bit2);
			break;
		}

		case 'Keyfob Device' : {
			const stateBits = bitmask.check(data[3]);
			securityState.tamperState  = Boolean(!stateBits.mask.bit2);
			break;
		}

		case 'PIR Device' : {
		// TODO
		// For whatever reason, there are these two invalid values that come through
		// They are somehow correlated to the tamperState set in parseStatusUpdate()
			if (data[1] === 0x01 || data[1] === 0x6E) {
				if (remote64 === '000d6f0003bc6b0c') {
					log.msg('parseSecurityState()', {
						remote64,
						error : 'data[1] === 0x01 || data[1] === 0x6E',
						nodeName,
						data,
						motionValueWouldBe : parseFloat(((data[1] / 255) * 100).toFixed(2)),
					});
				}

				break;
			}

			securityState.motionValue = parseFloat(((data[1] / 255) * 100).toFixed(2));
			securityState.motionState = Boolean(securityState.motionValue > 0);
			break;
		}

		case 'SmartPlug2.5' : {
			break;
		}
	}

	// if (remote64 === '000d6f0003bc6b0c') {
	// 	log.msg('parseSecurityState()', { remote64, error : 'none', nodeName, data, securityState });
	// }

	return securityState;
} // parseSecurityState(data, remote64, nodeName)

function parseStatusUpdate(data, remote64, nodeName = null) {
	// Process message, parse for status update

	// Field name       Size  Description
	// ----------       ----  -----------
	// Preamble         2     Unknown preamble TBC              ([ 0x09, 0x89 ])
	// Cluster command  1     Cluster command - status update   ([ 0xFB ])
	//
	// Type             1     0x1B clamp, 0x1C switch, 0x1D key fob, 0x1E, 0x1F door
	//
	// Counter          4     Counter                           ([ 0x0D, 0xB2, 0x00, 0x00 ])
	// TempCelsius      2     Temperature (Celsius)             ([ 0xF0, 0x0B ])
	// Unknown          6     ???                               ([ 'na', 0xD3, 0xFF, 0x03, 0x00 ])

	// Examples:
	// 0x09, 0x89, 0xFB, 0x1D, 0x0D, 0xB2, 0x00, 0x00, 0xF0, 0x0B, 'na', 0xD3, 0xFF, 0x03, 0x00  { temperature: 30.56, Counter: 13019 }
	//
	// 0x09, 0x0D, 0xFB, 0x1F < 0xF1, 0x08, 0x02 / 0x10 0x02, 0xCF, 0xFF, 0x01, 0x00 { temperature : 41.43, triggerState : 0, tamperState : 1 }


	// message alertme.AMGeneral.Lifesign<id="0xFB"> {
	//   const u8 LIFESIGN_HAS_VOLTAGE       = 0x01;
	//   const u8 LIFESIGN_HAS_TEMPERATURE   = 0x02;
	//   const u8 LIFESIGN_HAS_SWITCH_STATUS = 0x04;
	//   const u8 LIFESIGN_HAS_LQI           = 0x08;
	//   const u8 LIFESIGN_HAS_RSSI          = 0x10;
	//
	//   const u8 SWITCH_MASK_TAMPER_BUTTON = 0x02;
	//   const u8 SWITCH_MASK_MAIN_SENSOR   = 0x01;
	//
	//   const u8 SWITCH_STATE_TAMPER_BUTTON = 0x02;
	//   const u8 SWITCH_STATE_MAIN_SENSOR   = 0x01;
	//
	//   u8 statusFlags;
	//
	//   u32 msTimer;
	//
	//   i16 batteryVoltage;
	//   i16 temperature;
	//
	//   i8 rssi;
	//
	//   u8 lqi;
	//   u8 switchMask;
	//   u8 switchState;
	// }

	const statusState = {};
	const deviceType = data[3];

	for (let i = 0; i < data.length; i++) {
		statusState['statusStateValue' + i] = data[i];
	}


	switch (deviceType) {
		case 0x1B : statusState.statusSource = 'power clamp';   break;
		case 0x1C : statusState.statusSource = 'power switch';  break;
		case 0x1D : statusState.statusSource = 'key fob';       break;
		case 0x1E : statusState.statusSource = 'door sensor1E'; break;
		case 0x1F : statusState.statusSource = 'door sensor1F';
	}


	// TODO
	const supportBits = bitmask.check(data[14]);
	const stateBits = bitmask.check(data[0]);

	switch (statusState.statusSource) {
		case 'key fob'      :
		case 'power clamp'  :
		case 'power switch' : {
			break;
		}

		case 'door sensor1E' :
		case 'door sensor1F' : {
			// statusState.tamperState  = Boolean(stateBits.mask.bit1);
			statusState.triggerState = Boolean(stateBits.mask.bit0);
			break;
		}

		default : {
			log.error(`Unrecognized ${hex.i2s(deviceType)} device status from ${nodeName} (${remote64}) with length ${data.length}`, data);
		}
	}

	// statusState.counter = struct.unpack('<I', data[4:8])[0];

	const supportFlags = {
		voltage      : supportBits.mask.bit0,
		temperature  : supportBits.mask.bit1,
		switchStatus : supportBits.mask.bit2,
		lqi          : supportBits.mask.bit3,
		rssi         : supportBits.mask.bit4,
	};

	statusState.timerSec = data.readUInt32LE(3) / 100000;

	if (data[8] === 0xFF || data[9] === 0xFF) {
		log.error(`0xFF voltage weirdness ${hex.i2s(deviceType)} device status from ${nodeName} (${remote64}) with length ${data.length}`, data);
	}

	if (supportFlags.voltage === true && data[8] !== 0xFF && data[9] !== 0xFF) {
		const batteryVoltage = data.readUInt16LE(8) / 1000;

		if (batteryVoltage < 5) {
			statusState.batteryVoltage = batteryVoltage;

			let batteryLevel = (((batteryVoltage - batteryMinVoltage) / (batteryMaxVoltage - batteryMinVoltage)) * 100);

			// if (batteryLevel < 0)   batteryLevel = 0;
			// if (batteryLevel > 100) batteryLevel = 100;

			statusState.batteryLevel = num.round2(batteryLevel, 2);
		}
	}

	if (supportFlags.temperature === true) {
		const temperature = parseFloat((data.readInt16LE(10) * 0.0625).toString());

		if (temperature !== 0) {
			switch (typeof config.temperatureOffset[remote64] === 'number') {
				case false : {
					statusState.temperature = temperature;
					break;
				}

				case true : {
					// Offset temperature by configurable amount (in deg F)
					statusState.temperature = num.round2((temperature + config.temperatureOffset[remote64]), 3);
				}
			}
		}
	}

	if (supportFlags.lqi === true) {
		statusState.lqi = num.round2((data.readUInt8(13) / 255) * 100);
	}

	statusState.rssi = data.readInt8(12);

	// log.msg(`Additional ${statusState.statusSource} (${hex.i2s(deviceType)}) status data from ${nodeName} (${remote64}) with length ${data.length}`, data, supportFlags);


	if (remote64 === '000d6f0003bc6b0c') {
		log.msg('parseStatusUpdate()', { nodeName, data, statusState, error : 'none' });
	}

	return statusState;
} // parseStatusUpdate(data, remote64, nodeName)

function parseSwitchStateRequest(data) {
	log.msg('parseSwitchStateRequest()', data);

	// Process message, parse for switch relay state change request
	// This message is sent FROM the Hub TO the SmartPlug requesting state change

	// Field name             Size  Description
	// ----------             ----  -----------
	// Preamble               2     Unknown preamble TBC
	// Cluster command        1     Cluster command - change state (SmartPlug) ([ 0x02 ])
	// Requested relay state  2     [ 0x01, 0x01 ] = On, [ 0x00, 0x01 ] = Off

	// Parse switch state request
	return { switchState : Boolean(data[3]) };
} // parseSwitchStateRequest(data)

function parseSwitchStateUpdate(data) {
	log.msg('parseSwitchStateUpdate()', data);

	// Process message, parse for switch status
	// This message is sent TO the hub, FROM the SmartPlug, advertising state change

	// Field name       Size  Description
	// ----------       ----  -----------
	// Preamble         2     Unknown preamble TBC
	// Cluster command  1     Cluster command - Switch status Update ([ 0x80 ])
	// Relay state      2     [ 0x07, 0x01 ] = On, [ 0x06, 0x00 ] = Off

	// Examples:
	// <Buffer 09 6e 80 08 00>
	// <Buffer 09 95 80 09 01>

	const attributes = {
		switchState : Boolean(data[4]),
		// TODO
		// values : struct.unpack('< 2x b b b', data),
	};

	return attributes;
} // parseSwitchStateUpdate(data)

function parseTamperState(data) {
	log.msg('parseTamperState()', data);

	// Process message, parse for tamper switch state change

	// Field name       Size  Description
	// ----------       ----  -----------
	// Preamble         1     Unknown preamble TBC              ([ 0x09 ])
	// Cluster command  1     Cluster command - Security event  ([ 0x00 ])
	// Unknown          1     ???                               ([ 0x00 ], [ 0x01 ])
	// Tamper state     1     Tamper state                      ([ 0x01 = closed, 0x02 = open)
	// Counter          2     Counter (milliseconds)            ([ 0xE8, 0xA6 ])
	// Unknown          2     ???                               ([ 0x00, 0x00 ])

	// Examples:
	// [ 0x09, 0x00, 0x00, 0x02, 0xE8, 0xA6, 0x00, 0x00 ] { counter : 42728, tamperState : 1 }
	// [ 0x09, 0x00, 0x01, 0x01, 0xAB, 0x00, 0x00       ] { counter : 43819, tamperState : 0 }

	const stateBits = bitmask.check(data[3]);

	const attributes = {
		tamperState : Boolean(stateBits.mask.bit1),
		// TODO
		// counter : struct.unpack('<H', data[4:6])[0],
	};

	return attributes;
} // parseTamperState(data)


function parseFrame(frame) {
	const addr16OK = (typeof frame.remote16 !== 'undefined' && frame.remote16 !== null);
	let   addr64OK = (typeof frame.remote64 !== 'undefined' && frame.remote64 !== null);

	// const frameType = xbee_api.constants.FRAME_TYPE[frame.type];
	// log.msg('Received frame, type ' + frameType);
	// frame.typeName = frameType;

	if (frame.type === 0x88) {
		log.msg('parseFrame() Received AT command response');
		return parseATCommandResponse(frame);
	}


	if (addr16OK !== true) {
		log.msg('parseFrame() addr16 not OK', frame);
		return;
	}


	if (addr64OK !== true) {
		for (const nodeKey of Object.keys(status.xbee.nodes64)) {
			const node = status.xbee.nodes64[nodeKey];
			if (node.remote16 !== frame.remote16) continue;
			// log.msg('parseFrame() found potentially matching node (addr64OK !== true)', node.name, [ node.remote16, node.remote64 ]);
			frame.remote64 = node.remote64;
		}

		addr64OK = (typeof frame.remote64 !== 'undefined' && frame.remote64 !== null);

		if (addr64OK !== true) {
			log.msg('parseFrame() addr64 not OK', frame);
			return;
		}
	}


	if (frame.remote64 === 'ffffffffffffffff') {
		for (const nodeKey of Object.keys(status.xbee.nodes64)) {
			const node = status.xbee.nodes64[nodeKey];
			if (node.remote16 !== frame.remote16) continue;
			// log.msg('parseFrame() found potentially matching node (ffffffffffffffff)', node.name, [ node.remote16, node.remote64 ]);
			frame.remote64 = node.remote64;
		}
	}

	if (frame.remote64 === 'ffffffffffffffff') {
		log.msg('parseFrame() invalid remote64', frame);
		return;
	}


	// Detect "new" device
	if (typeof status.xbee.nodes64[frame.remote64] !== 'object') {
		status.xbee.nodes64[frame.remote64] = {};
		json.writeStatus();
	}

	const mqttTopicPrefix = 'stat/' + frame.remote64;


	// Add 16 bit address informtion to status and MQTT
	status.xbee.nodes64[frame.remote64].remote16 = frame.remote16;
	update.status('xbee.nodes64.' + frame.remote64 + '.remote16', frame.remote16);
	mqtt.pub(mqttTopicPrefix + '/remote16', frame.remote16, false);

	// Add 64 bit address informtion to status and MQTT
	status.xbee.nodes64[frame.remote64].remote64 = frame.remote64;
	update.status('xbee.nodes64.' + frame.remote64 + '.remote64', frame.remote64);
	mqtt.pub(mqttTopicPrefix + '/remote64', frame.remote64, true);

	// Add node name information from config
	let nodeName = null;
	if (typeof config.nodeNames[frame.remote64] !== 'undefined') {
		nodeName = config.nodeNames[frame.remote64];

		update.status('xbee.nodes64.' + frame.remote64 + '.name', nodeName);
		mqtt.pub(mqttTopicPrefix + '/name', nodeName, true);
	}

	// Add firstSeen timestamp to status and MQTT
	if (typeof status.xbee.nodes64[frame.remote64].firstSeen === 'undefined' || status.xbee.nodes64[frame.remote64].firstSeen === null) {
		status.xbee.nodes64[frame.remote64].firstSeen = new Date();
		mqtt.pub(mqttTopicPrefix + '/firstSeen', status.xbee.nodes64[frame.remote64].firstSeen, true);
	}

	// Update last seen timestamp
	status.xbee.nodes64[frame.remote64].lastSeen = new Date();
	mqtt.pub(mqttTopicPrefix + '/lastSeen', status.xbee.nodes64[frame.remote64].lastSeen, true);


	// Example: switch state message
	//
	// Received >> {
	//   type                : 145,
	//   typeName            : 'Zigbee Explicit Rx Indicator (AO=1) (0x91)'
	//   remote64            : '000d6f000354cbad',
	//   remote16            : '478e',
	//   sourceEndpoint      : '02',
	//   destinationEndpoint : '02',
	//   clusterId           : '00ee',
	//   profileId           : 'c216',
	//   receiveOptions      : 1,
	//   data                : <Buffer 09 6e 80 0d 01>,
	// }

	// log000d6f000354a654.msg('parseFrame type', frame.type);

	// type -> profileId -> clusterId -> clusterCmd


	// Get updated attributes
	let frameType       = null;
	let frameProfile    = null;
	let frameCluster    = null;
	let frameClusterCmd = null;

	let attributes;
	let clusterCmd;


	switch (frame.type) {
		case 0x88 : { // AT command response
			frameType = 'AT command response to command ' + frame.command;

			switch (frame.command) {
				case 'MY' : update.status('xbee.self.addr16', frame.commandData.toString('hex')); break;

				case 'SH' : addr64List[0] = frame.commandData.toString('hex'); break;
				case 'SL' : addr64List[1] = frame.commandData.toString('hex'); break;
			} // switch (frame.command)

			if (typeof addr64List[0] === 'string' && typeof addr64List[1] === 'string') {
				update.status('xbee.self.addr64', addr64List[0] + addr64List[1]);
			}

			break;
		}

		case 0x8B: { // Zigbee transmit status
			// frameType = 'Zigbee transmit status';
			frameType = 'TX status';
			break;
		}

		case 0x91 : { // Zigbee explicit RX indicator (AO=1)
			// Zigbee device profileId
			// const params = {
			// 	remote16    : frame.remote16,
			// 	zdoSequenceNumber : frame.data[0],
			// };

			// frameType = 'Zigbee explicit RX indicator';
			frameType = 'ExplRX';

			switch (frame.profileId) {
				case PROFILE_ID_ALERTME : {
					frameProfile = 'AlertMe';

					clusterCmd = Buffer.from([ frame.data[2] ]).toString('hex');

					switch (frame.clusterId) {
						case CLUSTER_ID.AM.ATTRIBUTE : {
							frameCluster = 'attribute';

							attributes = parseAttribute(frame.data);
							break;
						} // CLUSTER_ID.AM.ATTRIBUTE

						case CLUSTER_ID.AM.BUTTON : {
							frameCluster = 'button';

							attributes = parseButtonPress(frame.data);
							break;
						} // CLUSTER_ID.AM.BUTTON

						case CLUSTER_ID.AM.DISCOVERY : {
							frameCluster = 'discovery';

							switch (clusterCmd) {
								case CLUSTER_CMD.AM.RSSI : {
									frameClusterCmd = 'range info update';
									attributes      = parseRangeInfoUpdate(frame.data);

									// sendMessage('modeChangeRequest', { mode : 'normal' }, frame.remote64);
									break;
								} // CLUSTER_CMD.AM.RSSI

								case CLUSTER_CMD.AM.VERSION_REQ : {
									frameClusterCmd = 'version info request';

									// sendMessage('versionInfoUpdate', { remote16 : frame.remote16, zdoSequenceNumber }, frame.remote64);
									break;
								} // CLUSTER_CMD.AM.VERSION_REQ

								case CLUSTER_CMD.AM.VERSION_RESP : {
									frameClusterCmd = 'version info update';
									attributes      = parseVersionInfoUpdate(frame.data);
									break;
								} // CLUSTER_CMD.AM.VERSION_RESP

								default : {
									frameClusterCmd = 'unknown (' + clusterCmd + ')';
								}  // CLUSTER_CMD_AM default
							} // switch (clusterCmd)

							break;
						} // CLUSTER_ID.AM.DISCOVERY

						case CLUSTER_ID.AM.POWER : {
							frameCluster = 'power';

							switch (clusterCmd) {
								case CLUSTER_CMD.AM.POWER_CONSUMPTION : {
									frameClusterCmd = 'consumption & uptime update';
									attributes      = parsePowerConsumption(frame.data);

									sendMessage('switchStateRequest', { switchState : 'check' }, frame.remote64);
									break;
								} // CLUSTER_CMD.AM.POWER_CONSUMPTION

								case CLUSTER_CMD.AM.POWER_DEMAND : {
									frameClusterCmd = 'demand';
									attributes      = parseActivePower(frame.data);
									break;
								} // CLUSTER_CMD.AM.POWER_DEMAND

								case CLUSTER_CMD.AM.POWER_UNKNOWN : {
									frameClusterCmd = 'unknown';
									attributes      = parsePowerUnknown(frame.data);
									break;
								} // CLUSTER_CMD.AM.POWER_UNKNOWN

								default : {
									frameClusterCmd = 'unknown (' + clusterCmd + ')';
								}  // CLUSTER_CMD.AM.POWER default
							} // switch (clusterCmd)
							break;
						} // CLUSTER_ID.AM.POWER

						case CLUSTER_ID.AM.SECURITY : {
							frameCluster = 'security';

							// When the device first connects, it comes up in a state that
							// needs initialization, this command seems to take care of that
							// So, look at the value of the data and send the command

							// Buffer to compare to to detect
							const bufferCompare = Buffer.from([ 0x15, 0x00, 0x39, 0x10 ]);

							if (bufferCompare.compare(frame.data, 3, 6, 0, 3) === 0) {
								sendMessage('securityInit', null, frame.remote64);
							}

							attributes = parseSecurityState(frame.data, frame.remote64, nodeName);
							break;
						} // CLUSTER_ID.AM.SECURITY

						case CLUSTER_ID.AM.STATUS : {
							frameCluster = 'status';

							switch (clusterCmd) {
								case CLUSTER_CMD.AM.MODE_REQ : {
									frameClusterCmd = 'mode change request';
									// attributes      = parseModeChangeRequest(frame.data);
									break;
								} // CLUSTER_CMD.AM.MODE_REQ

								case CLUSTER_CMD.AM.STATUS : {
									frameClusterCmd = 'update';
									attributes      = parseStatusUpdate(frame.data, frame.remote64, nodeName);
									break;
								} // CLUSTER_CMD.AM.STATUS

								default : {
									frameClusterCmd = 'unknown (' + clusterCmd + ')';
								}
							} // switch (clusterCmd)
							break;
						} // CLUSTER_ID.AM.STATUS

						case CLUSTER_ID.AM.SWITCH : {
							frameCluster = 'switch';

							switch (clusterCmd) {
								case CLUSTER_CMD.AM.STATE_CHANGE : {
									frameClusterCmd = 'state change';

									// ON  : 0x11 0x00 0x02 0x01 0x01
									// OFF : 0x11 0x00 0x02 0x00 0x01
									// attributes = parseSwitchStateRequest(frame.data);

									// TODO
									// sendMessage('switchStateUpdate', { remote16 : frame.remote16, zdoSequenceNumber }, frame.remote64);
									break;
								} // CLUSTER_CMD.AM.STATE_CHANGE

								case CLUSTER_CMD.AM.STATE_REQ : {
									frameClusterCmd = 'state request';

									// 0x11 0x00 0x01 0x01
									// sendMessage('switchStateUpdate', { remote16 : frame.remote16, zdoSequenceNumber }, frame.remote64);
									break;
								} // CLUSTER_CMD.AM.STATE_REQ

								case CLUSTER_CMD.AM.STATE_RESP : {
									frameClusterCmd = 'state update';
									attributes      = parseSwitchStateUpdate(frame.data);
									break;
								} // CLUSTER_CMD.AM.STATE_RESP

								default : {
									frameClusterCmd = `unknown (${clusterCmd})`;
								}
							} // switch (clusterCmd)
							break;
						} // CLUSTER_ID.AM.SWITCH

						case CLUSTER_ID.AM.TAMPER : {
							frameCluster = 'tamper';
							attributes   = parseTamperState(frame.data);
							break;
						} // CLUSTER_ID.AM.TAMPER

						default : {
							frameCluster = `unknown (${frame.clusterId})`;
						} // CLUSTER_ID default
					} // switch (frame.clusterId)

					break;
				} // PROFILE_ID_ALERTME

				case PROFILE_ID_HA : {
					frameProfile = 'HA';
					break;
				} // PROFILE_ID_HA

				case PROFILE_ID_LL : {
					frameProfile = 'LL';
					break;
				} // PROFILE_ID_HA

				case PROFILE_ID_ZDP : {
					frameProfile = 'Zigbee';

					const zdoSequenceNumber = frame.data[0];

					switch (frame.clusterId) {
						case CLUSTER_ID.ZDO.ACTIVE_ENDPOINT.REQUEST : { // 0x0005
							frameCluster = 'active endpoint request';
							break;
						}

						case CLUSTER_ID.ZDO.ACTIVE_ENDPOINT.RESPONSE : { // 0x8005
							frameCluster = 'active endpoint response';
							attributes   = parseActiveEndpointResponse(frame.data, frame.remote64, nodeName);

							// This message tells us what the device can do, but it isn't constructed correctly to match what the switch can do according to the spec
							// This is another message that gets it's response after we receive the match descriptor request (below)

							// A couple of messages are sent to cause the switch to join with the controller at a network level and to cause it to regard this controller as valid
							// The device has to receive these two messages to stay joined
							setTimeout(() => {
								sendMessage('modeChangeRequest', { mode : 'normal' }, frame.remote64);
							}, (5 * 1000));

							setTimeout(() => {
								sendMessage('versionInfoRequest', null, frame.remote64);
							}, (7 * 1000));
							break;
						}

						case CLUSTER_ID.ZDO.NETWORK_ADDRESS.REQUEST : {
							frameCluster = 'network (16-bit) address request';
							break;
						}

						case CLUSTER_ID.ZDO.NETWORK_ADDRESS.RESPONSE : {
							frameCluster = 'network (16-bit) address response';
							break;
						}

						case CLUSTER_ID.ZDO.MANAGEMENT_ROUTING.REQUEST : {
							frameCluster = 'management routing table request';
							break;
						}

						case CLUSTER_ID.ZDO.MANAGEMENT_ROUTING.RESPONSE : {
							frameCluster = 'management routing response';
							break;
						}

						case CLUSTER_ID.ZDO.SIMPLE_DESC_REQ : {
							frameCluster = 'simple descriptor request';
							break;
						}

						case CLUSTER_ID.ZDO.MATCH_DESCRIPTOR.REQUEST : { // 0x0006
							frameCluster = 'match descriptor request';
							log.lib(frameCluster, frame.data);

							// Send the match descriptor response
							setTimeout(() => {
								sendMessage('matchDescriptorResponse', { remote16 : frame.remote16, zdoSequenceNumber }, frame.remote64);
							}, (1 * 1000));

							// This will tell me the address of the new thing, so we're going to send an Active Endpoint Request
							setTimeout(() => {
								sendMessage('activeEndpointRequest', { remote16 : frame.remote16, zdoSequenceNumber }, frame.remote64);
							}, (3 * 1000));
							break;
						}

						case CLUSTER_ID.ZDO.MATCH_DESCRIPTOR.RESPONSE : {
							frameCluster = 'match descriptor response';
							break;
						}

						case CLUSTER_ID.ZDO.END_DEVICE_ANNOUNCE : { // 0x0013
							frameCluster = 'device announce message';
							break;
						}

						case CLUSTER_ID.ZDO.PERMIT_JOINING.RESPONSE : {
							frameCluster = 'permit joining response';
							break;
						}

						default : {
							frameCluster = `unknown (${frame.clusterId})`;
						} // CLUSTER_ID default
					} // switch (frame.clusterId)

					break;
				} // PROFILE_ID_ZDP

				default : {
					frameProfile = `unknown (${frame.profileId})`;
				}
			} // switch (frame.profileId)
			break;
		}

		default : {
			frameType = `unknown (${frame.type})`;
		}
	} // switch (frame.type)


	let logString = 'Received ';

	logString += `from ${frame.remote64}/`;
	logString += frame.remote16;
	logString += ' ';

	if (nodeName !== null) logString += `(${nodeName}) `;

	if (typeof frame.sourceEndpoint      !== 'undefined' && frame.sourceEndpoint      !== null) logString = logString.trim() + ' ' + frame.sourceEndpoint;
	if (typeof frame.destinationEndpoint !== 'undefined' && frame.destinationEndpoint !== null) logString += '/' + frame.destinationEndpoint;

	if ((typeof frame.sourceEndpoint !== 'undefined' && frame.sourceEndpoint !== null) || (typeof frame.destinationEndpoint !== 'undefined' && frame.destinationEndpoint !== null)) {
		logString += ' ';
	}

	if (frameType !== null) logString = `${logString.trim()} ${frameType}`;

	if (frameProfile    !== null) logString += ' > ' + frameProfile;
	if (frameCluster    !== null) logString += ' > ' + frameCluster;
	if (frameClusterCmd !== null) logString += ' > ' + frameClusterCmd;


	log.lib(logString);

	if (typeof attributes !== 'object' || frame.remote64 === status.xbee.self.addr64) {
		return { attributes };
	}


	Object.keys(attributes).forEach(attribute => {
		// log.msg('parseFrame() attribute', attribute, attributes[attribute]);

		// const mqttPublish = update.status(`xbee.nodes64.${frame.remote64}.${attribute}`, attributes[attribute]);
		// if (mqttPublish !== true) return;

		let updateQuiet = false;
		// This is kind of wasteful
		if (attribute.includes('statusStateValue')) updateQuiet = true;

		update.status(`xbee.nodes64.${frame.remote64}.${attribute}`, attributes[attribute], updateQuiet);

		const attributeLastSeenOld = new Date(status.xbee.nodes64[frame.remote64][`${attribute}LastSeen`]);
		const attributeLastSeenNew = new Date();

		const diffLastSeen = (attributeLastSeenNew.getTime() - attributeLastSeenOld.getTime()) / 1000;

		let skipUpdate = false;

		// activePower
		// buttonState
		// contactState
		// motionState
		// motionValue
		// switchState
		// temperature
		switch (attribute) {
			case 'motionState' :
				// log.msg('attributeLastSeen()', frame.remote64, attribute, diffLastSeen);

				// console.log({ r64 : frame.remote64, diffLastSeen, attr : attributes[attribute] });
				if (diffLastSeen < motionTimeoutSec && attributes[attribute] === false) {
					skipUpdate = true;
				}
				break;
		}

		if (skipUpdate === true) return;

		// Update last attribute message timestamp
		update.status(`xbee.nodes64.${frame.remote64}.${attribute}LastSeen`, new Date(), true);

		const mqttTopicPath = mqttTopicPrefix + '/' + attribute;
		mqtt.pub(mqttTopicPath, attributes[attribute], true);
	});

	return { attributes };
} // parseFrame(frame)


async function writeFrameObject(frameObject) {
	if (xbee.portOpen !== true) return;

	const frameData = xbeeAPI.buildFrame(frameObject);

	try {
		await new Promise((resolve, reject) => serialport.write(frameData, resolve, reject));
		await new Promise((resolve, reject) => serialport.drain(resolve, reject));

		log.lib('writeFrameObject() wrote', frameData);

		return true;
	}
	catch (serialportWriteError) {
		log.error('writeFrameObject() serialportWriteError', serialportWriteError);
		return false;
	}
} // async writeFrameObject(frameObject)

function generateMessage(messageName, params = null) {
	if (xbee.portOpen !== true) return;

	// Make a deep copy of the message
	const message = clone(messages[messageName]);

	// If 'message.frame.data' is an anonymous function, then call it and replace with the return value
	if (typeof message.frame.dataGenerate === 'function') {
		message.frame.data = message.frame.dataGenerate(params);
		delete message.frame.dataGenerate;
	}

	// log.msg('generateMessage()', { messageName, params, message });

	// Return processed message
	return message.frame;
} // generateMessage(messageName, params)

async function sendATCommand(command, commandParameter = []) {
	if (xbee.portOpen !== true) return;

	const frameObject = {
		type : xbee_api.constants.FRAME_TYPE.AT_COMMAND, // 0x08

		command,
		commandParameter,
	};

	await writeFrameObject(frameObject);
} // sendATCommand(command, commandParameter)

async function sendMessage(messageName, params = null, remote64) {
	if (typeof status.xbee.nodes64[remote64] === 'undefined') {
		log.error('Failed to find remote64 address ' + remote64);
		return false;
	}

	if (typeof status.xbee.nodes64[remote64].remote16 === 'undefined') {
		log.error('Failed to find remote16 address corresponding with remote64 address ' + remote64);
		return false;
	}

	const remote16 = status.xbee.nodes64[remote64].remote16;

	const message = generateMessage(messageName, params);

	// log.msg('sendMessage()', { messageName, params, remote64, remote16 });
	log.msg('sendMessage()', { messageName, remote64 });

	await sendTxExplicit(message, remote64, remote16);
} // async sendMessage(messageName, params, remote64)

async function sendTxExplicit(message, remote64, remote16) {
	if (xbee.portOpen !== true) return;

	const frameObject = {
		type          : xbee_api.constants.FRAME_TYPE.EXPLICIT_ADDRESSING_ZIGBEE_COMMAND_FRAME, // 0x11
		destination64 : remote64,
		destination16 : remote16,
		...message,
	};

	// log.msg('sendTxExplicit()', frameObject);
	log.msg('sendTxExplicit()', frameObject.destination64, frameObject.clusterId + '/' + frameObject.profileId, frameObject.data);

	await writeFrameObject(frameObject);
} // sendTxExplicit(message, remote64, remote16)


function checkLastSeenDevices() {
	for (const nodeKey of Object.keys(status.xbee.nodes64)) {
		const node = status.xbee.nodes64[nodeKey];

		if (typeof node.lastSeen === 'undefined' || node.lastSeen === null) continue;
		if (typeof node.remote64 === 'undefined' || node.remote64 === null) continue;

		const dateOld = new Date(node.lastSeen);
		const dateNew = new Date();

		const diffLastSeen = (dateNew.getTime() - dateOld.getTime()) / 1000;

		// log.msg('checkLastSeenDevices()', node.remote64, diffLastSeen);

		let lwtStatus = 'offline';
		if (diffLastSeen < 600) lwtStatus = 'online';

		update.status('xbee.nodes64.' + nodeKey + '.lwtStatus', lwtStatus);
		mqtt.pub('tele/' + node.remote64 + '/LWT', lwtStatus, true);
	}
} // checkLastSeenDevices()


async function init() {
	log.lib('Initializing');

	xbeeAPI = new xbee_api.XBeeAPI({
		api_mode : config.xbee.apiMode,
	});

	serialport = new SerialPort(config.xbee.port, {
		autoOpen : false,
		baudRate : config.xbee.baudRate,
	});

	serialport.pipe(xbeeAPI.parser);
	xbeeAPI.builder.pipe(serialport);

	serialport.on('drain', () => {
		log.error('event: \'drain\'');
	});

	serialport.on('error', error => {
		log.error('serialport event: \'error\', ', error);
	});

	serialport.on('close', () => {
		log.lib('event: \'close\'');
	});

	serialport.on('open',  () => {
		xbee.portOpen = true;
		log.lib('event: \'open\'');

		readAddresses();
	});

	// All frames parsed by the XBee will be emitted here
	xbeeAPI.parser.on('data', parseFrame);

	try {
		log.lib('Opening serial port');
		await new Promise((resolve, reject) => serialport.open(resolve, reject));
		log.lib('Opened serial port');
	}
	catch (serialportOpenError) {
		log.error('init() serialportOpenError', serialportOpenError);
		return false;
	}

	if (xbee.interval.checkLastSeenDevices === null) {
		log.msg('init()', 'Set checkLastSeenDevices() interval');
		xbee.interval.checkLastSeenDevices = setInterval(checkLastSeenDevices, 5000);
	}

	log.lib('Initialized');
} // async init()

async function term() {
	log.lib('Terminating');

	clearInterval(xbee.interval.checkLastSeenDevices);
	xbee.interval.checkLastSeenDevices = null;

	try {
		log.lib('Closing serial port');
		await new Promise((resolve, reject) => serialport.close(resolve, reject));
		xbee.portOpen = false;
		log.lib('Closed serial port');
	}
	catch (serialportCloseError) {
		log.error('term() serialportCloseError', serialportCloseError);
		return false;
	}

	log.lib('Terminated');
} // async term()


module.exports = {
	interval : {
		checkLastSeenDevices : null,
	},

	portOpen : false,

	// Normal functions
	generateActiveEndpointRequest,
	generateMatchDescriptorRequest,
	generateMatchDescriptorResponse,
	generateMessage,
	generateModeChangeRequest,
	generateSecurityInit,
	generateSwitchStateRequest,
	generateVersionInfoRequest,

	parseActivePower,
	parseButtonPress,
	parseFrame,
	parsePowerConsumption,
	parsePowerUnknown,
	parseRangeInfoUpdate,
	parseSecurityState,
	parseStatusUpdate,
	parseSwitchStateRequest,
	parseSwitchStateUpdate,
	parseTamperState,
	parseVersionInfoUpdate,

	// Async functions
	readAddresses,
	sendATCommand,
	sendMessage,
	sendTxExplicit,
	writeFrameObject,

	// Start/stop functions
	init,
	term,
};
