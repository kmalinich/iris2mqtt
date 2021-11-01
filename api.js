const express = require('express');
const app     = express();
const server  = require('http').Server(app);

// body-parser to handle POSTed JSON
const body_parser = require('body-parser');
app.use(body_parser.json());


async function init() {
	log.lib('Initializing');

	app.all('*', (req, res, next) => {
		log.lib('[' + req.method + '] ' + req.originalUrl, { body : req.body });
		res.set('Content-Type', 'application/json');
		next();
	});


	app.get('/config', (req, res) => { res.send(config); });
	app.get('/status', (req, res) => { res.send(status); });

	app.post('/config', async (req, res) => {
		if (req.headers['content-type'] !== 'application/json') {
			res.send({ error : 'invalid content-type' });
			return;
		}

		config = req.body;
		await json.writeConfig();
		await res.send(config);
	});


	app.post('/xbee/readAddresses', async (req, res) => {
		const xbeeReturn = await xbee.readAddresses();
		await res.send(xbeeReturn);
	});

	app.post('/xbee/sendATCommand', async (req, res) => {
		const xbeeReturn = await xbee.sendATCommand(req.body.command, req.body.commandParameter);
		await res.send(xbeeReturn);
	});

	app.post('/xbee/sendMessage', async (req, res) => {
		const xbeeReturn = await xbee.sendMessage(req.body.messageName, req.body.params, req.body.remote64);
		await res.send(xbeeReturn);
	});


	app.post('/xbee/sendTxExplicit', async (req, res) => {
		const xbeeReturn = await xbee.sendTxExplicit(req.body.message, req.body.remote64, req.body.remote16);
		await res.send(xbeeReturn);
	});

	app.post('/xbee/writeFrameObject', async (req, res) => {
		const xbeeReturn = await xbee.writeFrameObject(req.body.frameObject);
		await res.send(xbeeReturn);
	});


	app.post('/xbee/generateActiveEndpointRequest', (req, res) => {
		const xbeeReturn = xbee.generateActiveEndpointRequest(req.body.params);
		res.send(xbeeReturn);
	});

	app.post('/xbee/generateMatchDescriptorRequest', (req, res) => {
		const xbeeReturn = xbee.generateMatchDescriptorRequest(req.body.params);
		res.send(xbeeReturn);
	});

	app.post('/xbee/generateMatchDescriptorResponse', (req, res) => {
		const xbeeReturn = xbee.generateMatchDescriptorResponse(req.body.params);
		res.send(xbeeReturn);
	});

	app.post('/xbee/generateMessage', (req, res) => {
		const xbeeReturn = xbee.generateMessage(req.body.messageName, req.body.params);
		res.send(xbeeReturn);
	});

	app.post('/xbee/generateModeChangeRequest', (req, res) => {
		const xbeeReturn = xbee.generateModeChangeRequest(req.body.params);
		res.send(xbeeReturn);
	});

	app.post('/xbee/generateSecurityInit', (req, res) => {
		const xbeeReturn = xbee.generateSecurityInit();
		res.send(xbeeReturn);
	});

	app.post('/xbee/generateSwitchStateRequest', (req, res) => {
		const xbeeReturn = xbee.generateSwitchStateRequest(req.body.params);
		res.send(xbeeReturn);
	});

	app.post('/xbee/generateVersionInfoRequest', (req, res) => {
		const xbeeReturn = xbee.generateVersionInfoRequest();
		res.send(xbeeReturn);
	});


	app.post('/xbee/parseButtonPress', (req, res) => {
		const xbeeReturn = xbee.parseButtonPress(req.body.data);
		res.send(xbeeReturn);
	});

	app.post('/xbee/parseFrame', (req, res) => {
		const xbeeReturn = xbee.parseFrame(req.body.frame);
		res.send(xbeeReturn);
	});

	app.post('/xbee/parsePowerConsumption', (req, res) => {
		const xbeeReturn = xbee.parsePowerConsumption(req.body.data);
		res.send(xbeeReturn);
	});

	app.post('/xbee/parseActivePower', (req, res) => {
		const xbeeReturn = xbee.parseActivePower(req.body.data);
		res.send(xbeeReturn);
	});

	app.post('/xbee/parsePowerUnknown', (req, res) => {
		const xbeeReturn = xbee.parsePowerUnknown(req.body.data);
		res.send(xbeeReturn);
	});

	app.post('/xbee/parseRangeInfoUpdate', (req, res) => {
		const xbeeReturn = xbee.parseRangeInfoUpdate(req.body.data);
		res.send(xbeeReturn);
	});

	app.post('/xbee/parseSecurityState', (req, res) => {
		const xbeeReturn = xbee.parseSecurityState(req.body.data);
		res.send(xbeeReturn);
	});

	app.post('/xbee/parseStatusUpdate', (req, res) => {
		const xbeeReturn = xbee.parseStatusUpdate(req.body.data);
		res.send(xbeeReturn);
	});

	app.post('/xbee/parseSwitchStateRequest', (req, res) => {
		const xbeeReturn = xbee.parseSwitchStateRequest(req.body.data);
		res.send(xbeeReturn);
	});

	app.post('/xbee/parseSwitchStateUpdate', (req, res) => {
		const xbeeReturn = xbee.parseSwitchStateUpdate(req.body.data);
		res.send(xbeeReturn);
	});

	app.post('/xbee/parseTamperState', (req, res) => {
		const xbeeReturn = xbee.parseTamperState(req.body.data);
		res.send(xbeeReturn);
	});

	app.post('/xbee/parseVersionInfoUpdate', (req, res) => {
		const xbeeReturn = xbee.parseVersionInfoUpdate(req.body.data);
		res.send(xbeeReturn);
	});


	log.lib('Initialized');

	await new Promise(resolve => server.listen(config.api.port, resolve));

	log.lib('Express listening on port ' + config.api.port);
}

async function term() {
	log.lib('Terminating');

	await server.close();

	log.lib('Terminated');
}


module.exports = {
	init,
	term,
};
