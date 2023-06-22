/*
 * Copyright 2022 Ilker Temir <ilker@ilkertemir.com>
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const request = require('request');
const math = require('mathjs');

const observationsKey = 'observations.windy';
userAgent = 'SignalK Windy Observations Plugin';
const checkEveryNMinutes = 15;
const distanceLimit = 100;

module.exports = function(app) {
  var plugin = {};
  var excludedStations;

  plugin.id = "windy-observations";
  plugin.name = "Windy Observations";
  plugin.description = "Publishes Windy obversations to Signal K";

  plugin.start = function(options) {
    if (options.excludeList) {
      excludedStations = options.excludeList.split(/\s*,\s*/);
    } else {
      excludedStations = []; 
    }
    // Position data is not immediately available, delay it
    setTimeout( function() {
      checkAndPublishObservations();
    }, 5000);

    setInterval( function() {
      checkAndPublishObservations();
    }, checkEveryNMinutes * 60 * 1000);
  }

  plugin.stop =  function() {
  };

  plugin.schema = {
    type: 'object',
    required: [],
    properties: {
      excludeList: {
        type: "string",
        title: "Comma separated list of station ids to exclude"
      },
    }
  }

  function checkAndPublishObservations() {
    let position = app.getSelfPath('navigation.position');
    if (!position) {
      app.debug(JSON.stringify(position));
      return;
    }
    let lat = position.value.latitude;
    let lng = position.value.longitude;
    retrieveObservations(lat,lng);
  }

  function degreesToRadians(value) {
    if (value === null) {
      return null;
    } else {
      return value*0.0174533;
    }
  }

  function celsiusToKelvin(value) {
    if (value === null) {
      return null;
    } else {
      return value + 273.15;
    }
  }

  function retrieveStationData(station) {
    if (excludedStations.includes(station)) {
      app.debug(`Excluded station ${station}, skipping`);
      return;
    } else {
      app.debug(`Retrieving station ${station}`);
    }
    let url=`https://node.windy.com/pois/stations/${station}`;
    request.get({
      url: url,
      json: true,
      headers: {
        'User-Agent': userAgent,
      }
    }, function(error, response, data) {
      if (!error && response.statusCode == 200) {
        let stationId = station.toLowerCase();
	let values = [
	    {
	      path: `${observationsKey}.${stationId}.name`,
	      value: data.name
	    },
	    {
	      path: `${observationsKey}.${stationId}.date`,
	      value: data.time
	    },
	    {
	      path: `${observationsKey}.${stationId}.position`,
	      value: {
                latitude: data.lat,
                longitude: data.lon
              }
	    },
	    {
	      path: `${observationsKey}.${stationId}.wind.speed`,
	      value: data.wind
	    },
	    {
	      path: `${observationsKey}.${stationId}.wind.gust`,
	      value: data.gust
	    },
	    {
	      path: `${observationsKey}.${stationId}.wind.direction`,
	      value: degreesToRadians(data.dir)
	    },
	    {
	      path: `${observationsKey}.${stationId}.temperature`,
	      value: celsiusToKelvin(data.temp)
	    },
	    {
	      path: `${observationsKey}.${stationId}.url`,
	      value: `https://www.windy.com/station/${stationId.toLowerCase()}`
	    }
	]
	app.handleMessage(plugin.id, {
            updates: [
              {
                values: values
              }
            ]
        });
      } else {
        app.debug(`Error retrieving ${url}: ${JSON.stringify(response)}`);
      }
    });
  }

  function deg2num(lat_deg, lon_deg, zoom) {
    const lat_rad = math.unit(lat_deg, 'deg').to('rad');
    const n = 2.0 ** zoom;
    const xtile = parseInt((lon_deg + 180.0) / 360.0 * n);
    const ytile = parseInt((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n);
    return {
      x: xtile,
      y: ytile
    }
  }

  function retrieveObservations(lat, lng) {
    const zoom = 8;
    let tiles = deg2num(lat, lng, zoom);
    let url=`https://node.windy.com/pois/stations/tiles/${zoom}/${tiles.x}/${tiles.y}`;
    app.debug(`Retrieving stations via ${url}`);
    request.get({
      url: url,
      json: true,
      headers: {
        'User-Agent': userAgent,
      }
    }, function(error, response, data) {
      if (!error && response.statusCode == 200) {
        let stations = data.data
        let stationCount = stations.length / data.items;
        for (let i=0;i<stationCount;i++) {
          let station = stations[i*7];
          retrieveStationData(station);
        }
      } else {
        app.debug('Error retrieving stations ${JSON.stringify(response)}');
      }
    });
  }
  return plugin;
}
