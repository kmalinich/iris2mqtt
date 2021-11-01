const object_path  = require('object-path');

// WIP
// const statusTransform = {
//   engine : {
//     rpm : (input) => {
//       return Math.round(input);
//     },
//   },
// };


class update {
	// update.config('system.host_data.refresh_interval', 15000, false);
	config(key, valueNew, quiet) {
		const valueOld = object_path.get(config, key);

		if (valueNew === valueOld) return false;

		const keyFull = 'config.' + key;
		if (quiet !== true) log.change({ keyFull, valueNew });

		object_path.set(config, key, valueNew);

		return true;
	}

	// update.status('engine.rpm', 1235, false);
	status(key, valueNew, quiet = false) {
		const valueOld = object_path.get(status, key);

		if (valueNew === valueOld) return false;

		object_path.set(status, key, valueNew);

		const keyFull = 'status.' + key;
		if (quiet !== true) log.change({ keyFull, valueNew });

		return true;
	}
}


module.exports = update;
