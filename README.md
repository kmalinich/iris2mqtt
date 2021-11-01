# iris2mqtt

Lowe's Iris Gen1 to MQTT/Home Assistant adapter application

* Uses MQTT autodiscovery with Home Assistant
* Works with:
  * Alarm keypads
    * Key presses are transmitted as HA events via the HA event API
  * Door sensors
    * Contact sensor state
    * Temperature
    * Battery level/voltage
    * RSSI
  * Motion sensors
    * Motion sensor state
    * Temperature
    * Battery level/voltage
    * RSSI
  * Power plugs
    * On/off state (and control)
    * RSSI
* Add your sensor/switch/plug Zigbee remote64 identifiers and names as object keys
under .nodeNames as shown in the config example below
* Also, yes, this needs more documentation

## Example config.json

```json
{
  "api": {
    "port": 1376
  },
  "homeassistant": {
    "host": "https://ha.localdomain",
    "ignoreCert": false,
    "port": 8123,
    "token": "TOKEN"
  },
  "mqtt": {
    "clientId": "iris2mqtt",
    "server": "mqtt.localdomain"
  },
  "nodeNames": {
    "000d6f00024c2cc9": "Garage motion sensor",
    "000d6f000258985d": "Kitchen back yard entry door sensor",
    "000d6f00028f3f4d": "Living room A sensor",
    "000d6f0003b314f2": "Front room A sensor",
    "000d6f0003bbf44d": "Stairwell motion sensor",
    "000d6f0003bc4ffb": "Living room motion sensor",
    "000d6f0003bc5844": "Front room motion sensor",
    "000d6f0003bc59cd": "Kitchen motion sensor"
  },
  "temperatureOffset": {
    "000d6f00024c2cc9": -2,
    "000d6f000258985d": -2,
    "000d6f00028f3f4d": -1.7798788888799895,
    "000d6f0003b314f2": -2
  },
  "xbee": {
    "apiMode": 2,
    "baudRate": 115200,
    "port": "/dev/ttyUSB0"
  }
}
```
