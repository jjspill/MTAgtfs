import * as AWS from 'aws-sdk';
import fetch from 'node-fetch';
import * as protobuf from './lambda/compiled';
import moment from 'moment-timezone';
import GChatService from './gchat_service';

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

interface StopTimeUpdate {
  stopId: string;
  arrival: { time: number };
}

interface TrainArrival {
  stopId: string;
  arrivalTime: string;
  tripId: string;
  routeId: string; // line
}

function getESTTimestamp() {
  const format = 'YYYY-MM-DD HH:mm:ss.SSS';
  const timeInEST = moment().tz('America/New_York').format(format);
  return timeInEST;
}

function formatTime(timestamp: any): string {
  const date = new Date(timestamp * 1000);
  return date.toISOString();
}

export const handler = async (): Promise<void> => {
  const gChat = new GChatService(process.env.WEBHOOK_URL!);
  try {
    const responses = await Promise.all(
      urls.map((url) =>
        fetch(url).then((response) =>
          response.ok
            ? response.arrayBuffer()
            : Promise.reject(
                new Error(`HTTP error! status: ${response.status}`),
              ),
        ),
      ),
    );

    const stopsMap: Record<string, TrainArrival[]> = {};
    const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds

    let skipping = 0;
    let inThePast = 0;
    responses.forEach((buffer) => {
      const feed = FeedMessage.decode(new Uint8Array(buffer));
      feed.entity.forEach((entity: any) => {
        entity?.tripUpdate?.stopTimeUpdate.forEach((update: StopTimeUpdate) => {
          if (
            update &&
            update.stopId &&
            update.arrival &&
            update.arrival.time > currentTime // Only consider future arrivals, ensuring it's strictly greater than current time
          ) {
            if (!stopsMap[update.stopId]) {
              stopsMap[update.stopId] = [];
            }

            const train: TrainArrival = {
              stopId: update.stopId,
              arrivalTime: formatTime(update.arrival.time),
              tripId: entity.tripUpdate.trip.tripId,
              routeId: entity.tripUpdate.trip.routeId,
            };

            stopsMap[update.stopId].push(train);
          } else {
            skipping++;
            if (update?.arrival?.time < currentTime) {
              inThePast++;
            }
          }
        });
      });
    });

    console.log('Total skipped updates:', skipping);
    console.log('Total updates in the past:', inThePast);

    // Sort and limit stopsMap entries before writing to DynamoDB
    Object.keys(stopsMap).forEach((key) => {
      stopsMap[key].sort(
        (a, b) =>
          new Date(a.arrivalTime).getTime() - new Date(b.arrivalTime).getTime(),
      );
      stopsMap[key] = stopsMap[key].slice(0, 10); // Limit to the closest 10 arrivals
    });

    // Prepare and execute batch writes
    let totalItems = 0;
    let totalUnprocessedItems = 0;
    let totalBatchWrites = 0;
    let errors = 0;

    for (const [stopId, updates] of Object.entries(stopsMap)) {
      totalItems += updates.length;
      totalBatchWrites++;
      const batchItems = updates.map((update, index) => ({
        PutRequest: {
          Item: {
            stopId: stopId,
            trainOrder: index + 1,
            arrivalTime: update.arrivalTime,
            tripId: update.tripId,
            routeId: update.routeId,
            uploadedAt: getESTTimestamp(),
            timeToArrival: moment(update.arrivalTime).diff(
              moment(getESTTimestamp()),
              'minutes',
            ),
          },
        },
      }));

      const batchWriteParams = {
        RequestItems: {
          GtfsHandlerTable: batchItems,
        },
      };

      try {
        const data = await dynamoDb.batchWrite(batchWriteParams).promise();
        if (data.UnprocessedItems && data.UnprocessedItems.GtfsHandlerTable) {
          totalUnprocessedItems +=
            data.UnprocessedItems.GtfsHandlerTable.length;
        }
      } catch (err) {
        console.error('Error in batch write:', err);
        errors++;
      }
    }

    console.log('Total unprocessed items:', totalUnprocessedItems);
    console.log('Total stops uploaded: ', totalItems);
    const averageBatchSize =
      totalBatchWrites > 0 ? totalItems / totalBatchWrites : 0;

    console.log('Average batch size:', averageBatchSize);

    await gChat.sendSummaryInformation(
      totalUnprocessedItems,
      totalItems,
      averageBatchSize,
      errors,
    );
  } catch (error) {
    console.error('Error processing GTFS feeds:', error);
  }
};
