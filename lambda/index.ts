import * as AWS from 'aws-sdk';
import fetch from 'node-fetch';
import * as protobuf from './compiled';
import { StationTrainSchedule } from './TrainMap';
import {
  convertUnixToISO8601,
  delay,
  getStationName,
  getStopsCSV,
} from './trainHelpers';

// Configuring AWS Region
AWS.config.update({ region: 'us-east-1' });
const FeedMessage = protobuf.transit_realtime.FeedMessage;

const urls: string[] = [
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g',
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz',
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l',
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-si',
];

async function processTransitData(tableName: string): Promise<void> {
  console.log('Processing transit data...');
  const responses = await Promise.all(
    urls.map((url) =>
      fetch(url).then((response) =>
        response.ok
          ? response.arrayBuffer()
          : Promise.reject(new Error(`HTTP error! status: ${response.status}`)),
      ),
    ),
  );

  const arrivalMap = new StationTrainSchedule();
  const stopsCsv = getStopsCSV();

  responses.forEach((response) => {
    const feed = FeedMessage.decode(new Uint8Array(response)).toJSON();
    feed.entity.forEach((entity: any) => {
      if (entity.tripUpdate && entity.tripUpdate.stopTimeUpdate) {
        const destination = getStationName(
          stopsCsv,
          entity.tripUpdate.stopTimeUpdate[
            entity.tripUpdate.stopTimeUpdate.length - 1
          ].stopId.slice(0, -1),
        );

        entity.tripUpdate.stopTimeUpdate.forEach((update: any) => {
          const stopId = update.stopId;
          const arrivalTime = update.arrival?.time || update.departure?.time;
          if (!arrivalTime) return;

          const arrivalTimeString = convertUnixToISO8601(arrivalTime);
          arrivalMap.insert(stopId, {
            arrivalTime: arrivalTimeString,
            tripId: entity.tripUpdate.trip.tripId,
            routeId: entity.tripUpdate.trip.routeId,
            destination,
          });
        });
      }
    });
  });

  await arrivalMap.writeToPostgres(tableName);
  console.log('Transit data processed for table:', tableName);
}

export const handler = async (): Promise<void> => {
  await processTransitData('arrivals_secondary');
  await processTransitData('arrivals');
};

// export const handler = async (): Promise<void> => {
//   const startTime = Date.now(); // Record the start time of the first process

//   await processTransitData(); // Run the first time

//   const endTime = Date.now();
//   const processDuration = endTime - startTime;
//   const remainingDelay = 30000 - processDuration; // Calculate the remaining time to wait

//   if (remainingDelay > 0) {
//     console.log(`Waiting for ${remainingDelay}ms...`);
//     await delay(remainingDelay); // Wait for the remainder of the 30 seconds
//   }

//   await processTransitData(); // Run the second time
// };
