import * as AWS from 'aws-sdk';
import directionNames from './directionNames.json';

export interface TrainArrivalMap {
  arrivalTime: string; // ISO 8601 format for simplicity in sorting
  tripId: string;
  routeId: string; // line
  destination: string;
}

interface DirectionLabels {
  northbound: string;
  southbound: string;
}

interface DirectionMap {
  [key: string]: DirectionLabels;
}

export const getTripHeadsign = (
  stationId: string,
  directionKey: 'northbound' | 'southbound',
): string => {
  const directions: DirectionMap = directionNames;
  if (directionKey !== 'northbound' && directionKey !== 'southbound') {
    throw new Error('Invalid direction key');
  }
  if (!stationId) {
    throw new Error('Invalid stationId');
  }

  const station = directions[stationId];
  if (!station) {
    return directionKey === 'northbound' ? 'Northbound' : 'Southbound';
  }
  return (
    station[directionKey] ||
    (directionKey === 'northbound' ? 'Northbound' : 'Southbound')
  );
};

export class StationTrainSchedule {
  private stationMap: {
    [stationId: string]: {
      northbound: {
        name: string;
        trains: TrainArrivalMap[];
      };
      southbound: {
        name: string;
        trains: TrainArrivalMap[];
      };
    };
  };

  constructor() {
    this.stationMap = {};
  }

  keys(): string[] {
    return Object.keys(this.stationMap);
  }

  insert(fullStationId: string, newTrain: TrainArrivalMap): void {
    const direction = fullStationId.slice(-1); // 'N' or 'S'
    const stationId = fullStationId.slice(0, -1);

    if (!this.stationMap[stationId]) {
      this.stationMap[stationId] = {
        northbound: { trains: [], name: '' },
        southbound: { trains: [], name: '' },
      };
    }

    const directionKey = direction === 'N' ? 'northbound' : 'southbound';
    const trip_headsign = getTripHeadsign(stationId, directionKey);

    const pos = this.binarySearch(
      this.stationMap[stationId][directionKey].trains,
      newTrain.arrivalTime,
    );
    this.stationMap[stationId][directionKey].trains.splice(pos, 0, newTrain);

    trip_headsign && this.stationMap[stationId][directionKey].name === ''
      ? (this.stationMap[stationId][directionKey].name = trip_headsign)
      : null;

    if (this.stationMap[stationId][directionKey].trains.length > 10) {
      this.stationMap[stationId][directionKey].trains.length = 10;
    }
  }

  private binarySearch(trains: TrainArrivalMap[], targetTime: string): number {
    let low = 0;
    let high = trains.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (trains[mid].arrivalTime < targetTime) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }

  getSchedule(stationId: string, direction?: 'northbound' | 'southbound'): any {
    return direction
      ? this.stationMap[stationId]
        ? this.stationMap[stationId][direction]
        : []
      : this.stationMap[stationId]
        ? this.stationMap[stationId]
        : {};
  }

  async writeToDynamoDB(
    client: AWS.DynamoDB.DocumentClient,
    tableName: string,
  ): Promise<void> {
    try {
      let writeRequests = [];
      let totalWCU = 0;
      let totalSize = 0;
      let absoluteTotalSize = 0;
      let absoluteTotalWCU = 0;

      for (const [stationId, directions] of Object.entries(this.stationMap)) {
        const item = {
          stopId: stationId,
          northbound_station: directions.northbound.name,
          southbound_station: directions.southbound.name,
          northbound: directions.northbound,
          southbound: directions.southbound,
          ttl: Math.floor(Date.now() / 1000) + 60 * 10, // 10 minutes TTL
        };

        // Estimate item size in bytes
        const itemSize = this.estimateItemSize(item);
        totalSize += itemSize;

        // DynamoDB WCU calculation (1 WCU for each 1KB)
        const itemWCU = Math.ceil(itemSize / 1024);
        totalWCU += itemWCU;

        writeRequests.push({
          PutRequest: {
            Item: item,
          },
        });

        if (writeRequests.length === 25) {
          const batchWriteParams = {
            RequestItems: {
              [tableName]: writeRequests.splice(0, 25),
            },
          };
          await client.batchWrite(batchWriteParams).promise();
          console.log(
            `Batch written with estimated WCUs: ${totalWCU}, Size: ${totalSize} bytes`,
          );
          absoluteTotalSize += totalSize;
          absoluteTotalWCU += totalWCU;
          totalWCU = 0; // Reset for next batch
          totalSize = 0; // Reset for next batch
        }
      }

      if (writeRequests.length > 0) {
        const batchWriteParams = {
          RequestItems: {
            [tableName]: writeRequests,
          },
        };
        await client.batchWrite(batchWriteParams).promise();
        console.log(
          `Final batch written with estimated WCUs: ${totalWCU}, Size: ${totalSize} bytes`,
        );
      }

      console.log(
        `Total WCUs: ${absoluteTotalWCU}, Total Size: ${absoluteTotalSize} bytes`,
      );
      console.log('Data successfully written to DynamoDB');
    } catch (error) {
      console.error('Error writing to DynamoDB:', error);
    }
  }

  private estimateItemSize(item: any): number {
    const jsonItem = JSON.stringify(item);
    return Buffer.byteLength(jsonItem, 'utf8');
  }

  private async handleUnprocessedItems(
    data: any,
    tableName: string,
    client: AWS.DynamoDB.DocumentClient,
  ): Promise<void> {
    if (
      data.UnprocessedItems &&
      data.UnprocessedItems[tableName] &&
      data.UnprocessedItems[tableName].length > 0
    ) {
      const retryParams = {
        RequestItems: {
          [tableName]: data.UnprocessedItems[tableName],
        },
      };
      await client.batchWrite(retryParams).promise();
    }
  }

  writeScheduleToFile(fileName: string): void {
    const fs = require('fs');
    const path = require('path');
    fs.writeFileSync(
      path.join(__dirname, `${fileName}.json`),
      JSON.stringify(this.stationMap, null, 2),
    );
  }

  logSchedule(stationId: string): void {
    this.getSchedule(stationId, 'northbound')?.forEach((train: any) => {
      const arrivalTime = new Date(train.arrivalTime);
      console.log(
        `Train ${train.tripId} on route ${train.routeId} arrives at ${arrivalTime.toLocaleTimeString()}`,
      );
    }),
      console.log('---'),
      this.getSchedule(stationId, 'southbound')?.forEach((train: any) => {
        const arrivalTime = new Date(train.arrivalTime);
        console.log(
          `Train ${train.tripId} on route ${train.routeId} arrives at ${arrivalTime.toLocaleTimeString()}`,
        );
      });
  }
}
