import * as AWS from 'aws-sdk';
import fetch from 'node-fetch';
import * as protobuf from './compiled';
import moment from 'moment-timezone';
import GChatService from '../gchat_service';
import path from 'path';
import { promises as fs, write } from 'fs';
import { StationTrainSchedule } from './TrainMap';
import { getStationName, getStopsCSV } from './trainHelpers';

// Configuring AWS Region
AWS.config.update({ region: 'us-east-1' });

const dynamoDb = new AWS.DynamoDB.DocumentClient();
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

interface TrainArrival {
  stopId: string;
  arrivalTime: string;
  tripId: string;
  routeId: string; // line
}

interface Upload {
  southbound: TrainArrival[];
  northbound: TrainArrival[];
}

async function writeDataToFile(
  data: any,
  folderName: string,
  fileName: string,
): Promise<void> {
  const dirPath = path.join(__dirname, 'decoded', folderName);
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(
    path.join(dirPath, `${fileName}.json`),
    JSON.stringify(data, null, 2),
  );
}

function convertUnixToISO8601(unixTimestamp: string): string {
  const date = new Date(parseInt(unixTimestamp) * 1000);
  return date.toISOString();
}

export const handler = async (): Promise<void> => {
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

  // console.log('astor place', arrivalMap.getSchedule('L06'));
  // arrivalMap.logSchedule('F14');

  await arrivalMap.writeToDynamoDB(dynamoDb, process.env.TABLE_NAME!);
  // console.log('arrivals', arrivalMap.getSchedule('F14'));
};
