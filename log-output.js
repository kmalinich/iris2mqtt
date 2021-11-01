/* eslint no-console: 0 */


const align    = require('multipad');
const caller   = require('callers-path');
const path     = require('path');
const trucolor = require('trucolor');


// 24bit color chalk-style palette
const chalk = (0, trucolor.chalkish)((0, trucolor.palette)({}, {
	black     : 'rgb:48,48,48',
	blue      : 'rgb:51,152,219',
	cyan      : 'rgb:0,200,200',
	green     : 'rgb:47,223,100',
	gray      : 'rgb:144,144,144',
	orange    : 'rgb:255,153,50',
	pink      : 'rgb:178,0,140',
	purple    : 'rgb:114,83,178',
	red       : 'rgb:231,76,60',
	white     : 'rgb:224,224,224',
	yellow    : 'rgb:255,204,50',
	lightgray : 'rgb:175,175,175',

	boldblack  : 'bold rgb:48,48,48',
	boldblue   : 'bold rgb:51,152,219',
	boldcyan   : 'bold rgb:0,200,200',
	boldgreen  : 'bold rgb:47,223,100',
	boldgray   : 'bold rgb:144,144,144',
	boldorange : 'bold rgb:255,153,50',
	boldpink   : 'bold rgb:178,0,140',
	boldpurple : 'bold rgb:114,83,178',
	boldred    : 'bold rgb:231,76,60',
	boldwhite  : 'bold rgb:224,224,224',
	boldyellow : 'bold rgb:255,204,50',

	italicblack  : 'italic rgb:48,48,48',
	italicblue   : 'italic rgb:51,152,219',
	italiccyan   : 'italic rgb:0,200,200',
	italicgreen  : 'italic rgb:47,223,100',
	italicgray   : 'italic rgb:144,144,144',
	italicorange : 'italic rgb:255,153,50',
	italicpink   : 'italic rgb:178,0,140',
	italicpurple : 'italic rgb:114,83,178',
	italicred    : 'italic rgb:231,76,60',
	italicwhite  : 'italic rgb:224,224,224',
	italicyellow : 'italic rgb:255,204,50',
}));

const padding = {
	src   : 6,
	topic : 9,
};


function center(string, width) {
	return align.center(string, width, ' ');
}

// Colorize data source string by name
function colorizeSource(sourceName) {
	switch (sourceName.trim()) {
		case 'api'   : sourceName = chalk.green(sourceName);  break;
		case 'index' : sourceName = chalk.cyan(sourceName);   break;
		case 'mqtt'  : sourceName = chalk.purple(sourceName); break;
		case 'xbee'  : sourceName = chalk.orange(sourceName); break;
		default      : sourceName = chalk.yellow(sourceName);
	}

	return sourceName;
}

function colorize(string) {
	string = string.toString();

	string = string.replace('Attempting',    chalk.yellow('Attempting'));
	string = string.replace('Connecting',    chalk.yellow('Connecting'));
	string = string.replace('Initializing',  chalk.yellow('Initializing'));
	string = string.replace('Reset',         chalk.yellow('Reset'));
	string = string.replace('Shutting down', chalk.yellow('Shutting down'));
	string = string.replace('Starting',      chalk.yellow('Starting'));
	string = string.replace('Stopping',      chalk.yellow('Stopping'));
	string = string.replace('Terminating',   chalk.yellow('Terminating'));

	string = string.replace('Disconnected',  chalk.red('Disconnected'));
	string = string.replace('Error',         chalk.red('Error'));
	string = string.replace('SIGINT',        chalk.red('SIGINT'));
	string = string.replace('SIGTERM',       chalk.red('SIGTERM'));
	string = string.replace('Shut down',     chalk.red('Shut down'));
	string = string.replace('Stopped',       chalk.red('Stopped'));
	string = string.replace('Terminated',    chalk.red('Terminated'));
	string = string.replace('Unset',         chalk.red('Unset'));
	string = string.replace(' closed',       chalk.red(' closed'));
	string = string.replace(' disconnected', chalk.red(' disconnected'));
	string = string.replace('error',         chalk.red('error'));
	string = string.replace('false',         chalk.red('false'));

	string = string.replace('Connected ',   chalk.green('Connected '));
	string = string.replace('Reconnected ', chalk.green('Reconnected '));
	string = string.replace('reconnected ', chalk.green('reconnected '));
	string = string.replace('Initialized',  chalk.green('Initialized'));
	string = string.replace('Listening ',   chalk.green('Listening '));
	string = string.replace('Loaded ',      chalk.green('Loaded '));
	string = string.replace('Read ',        chalk.green('Read '));
	string = string.replace('Set ',         chalk.green('Set '));
	string = string.replace('Started',      chalk.green('Started'));
	string = string.replace('Wrote',        chalk.green('Wrote'));
	string = string.replace(' connected',   chalk.green(' connected'));
	string = string.replace(' opened',      chalk.green(' opened'));
	string = string.replace('true',         chalk.green('true'));

	return string;
}


// Formatted output for when a value changes
function change(data) {
	let dataNew   = data.valueNew;
	let dataSrc   = path.parse(caller()).name;
	let dataTopic = 'CHANGE';
	let dataValue = data.keyFull;

	// Pad strings
	dataSrc   = center(dataSrc,   padding.src);
	dataTopic = center(dataTopic, padding.topic);

	// Catch nulls
	if (typeof data.valueNew === 'undefined' || data.valueNew === null) data.valueNew = 'null';

	// Colorize strings
	dataSrc   = chalk.blue(dataSrc);
	dataTopic = chalk.cyan(dataTopic);
	dataValue = chalk.boldblue(dataValue);

	// Replace and colorize true/false
	let dataNewFormat;
	switch (typeof dataNew) {
		case 'boolean' : {
			dataNew = dataNew.toString().replace('true', chalk.green('true')).replace('false', chalk.red('false'));
			dataNewFormat = '%s';
			break;
		}

		case 'string' : {
			dataNew = chalk.cyan(dataNew);
			dataNewFormat = '\'%s\'';
			break;
		}

		default : {
			dataNewFormat = '%o';
		}
	}

	// Output formatted string
	console.log('[%s] [%s] %s: ' + dataNewFormat, dataSrc, dataTopic, dataValue, dataNew);
} // change(data)

function error(dataMsg, ...rest) {
	let dataSrc   = path.parse(caller()).name;
	let dataTopic = 'ERROR';

	// Pad strings
	dataSrc   = center(dataSrc,   padding.src);
	dataTopic = center(dataTopic, padding.topic);

	// Colorize strings
	dataSrc   = chalk.red(dataSrc);
	dataTopic = chalk.red(dataTopic);

	// Only colorize log message if it is a string
	let dataMsgFormat = '%o';
	if (typeof dataMsg === 'string') {
		dataMsgFormat = '%s';
	}

	// Output formatted string
	console.log('[%s] [%s] ' + dataMsgFormat, dataSrc, dataTopic, dataMsg, ...rest);
} // error(data)

function lib(dataMsg, ...rest) {
	if (appEnv === 'production') return;

	let dataSrc   = path.parse(caller()).name;
	let dataTopic = 'LIBRARY';

	// Pad strings
	dataSrc   = center(dataSrc,   padding.src);
	dataTopic = center(dataTopic, padding.topic);

	// Colorize strings
	dataSrc   = colorizeSource(dataSrc);
	dataTopic = chalk.gray(dataTopic);


	// Only colorize log message if it is a string
	let dataMsgFormat = '%o';
	if (typeof dataMsg === 'string') {
		dataMsg = chalk.lightgray(dataMsg);
		dataMsg = colorize(dataMsg);
		dataMsgFormat = '%s';
	}

	// Output formatted string
	console.log('[%s] [%s] ' + dataMsgFormat, dataSrc, dataTopic, dataMsg, ...rest);
} // lib(data)

function msg(dataMsg, ...rest) {
	if (appEnv === 'production') return;

	let dataSrc   = path.parse(caller()).name;
	let dataTopic = 'MESSAGE';

	// Pad strings
	dataSrc   = center(dataSrc,   padding.src);
	dataTopic = center(dataTopic, padding.topic);

	// Colorize strings
	dataSrc   = colorizeSource(dataSrc);
	dataTopic = chalk.pink(dataTopic);

	// Only colorize log message if it is a string
	let dataMsgFormat = '%o';
	if (typeof dataMsg === 'string') {
		dataMsg = chalk.italicpink(dataMsg);
		dataMsg = colorize(dataMsg);
		dataMsgFormat = '%s';
	}

	// Output formatted string
	console.log('[%s] [%s] ' + dataMsgFormat, dataSrc, dataTopic, dataMsg, ...rest);
} // msg(data)


module.exports = {
	// 24bit color chalk-style palette
	chalk,

	change,
	error,
	lib,
	msg,
};
