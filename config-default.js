const config_object = {
	api : {
		port : 1376,
	},

	homeassistant : {
		host       : null,
		port       : 8123,
		token      : null,
		ignoreCert : false,
	},

	mqtt : {
		clientId : 'iris2mqtt',
		server   : 'mqtt,
	},

	nodeNames : {
	},

	temperatureOffset : {
	},

	xbee : {
		apiMode  : 2,
		baudRate : 115200,
		port     : null,
	},
};


module.exports = config_object;
