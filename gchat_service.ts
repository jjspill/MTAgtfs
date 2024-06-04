import fetch from 'node-fetch';
import moment from 'moment-timezone';

class GChatService {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  private makeWidget(text: string): any {
    return { textParagraph: { text } };
  }

  private makeCard(header: any, widgets: any[]): any {
    return {
      header: header,
      sections: [{ widgets: widgets }],
    };
  }

  private generateSummaryCard(
    totalUnprocessedItems: number,
    totalStopsUploaded: number,
    errors: number,
    averageBatchSize: number,
  ): any {
    const currentDatetime = moment()
      .tz('America/New_York')
      .format('YYYY-MM-DD HH:mm:ss');
    const header = {
      title: 'Run Summary',
      subtitle: currentDatetime,
    };

    const summaryText = `Total unprocessed items: ${totalUnprocessedItems}\nTotal stops uploaded: ${totalStopsUploaded}\nAverage Batch Size: ${averageBatchSize}\nError Count: ${errors}`;

    return this.makeCard(header, [this.makeWidget(summaryText)]);
  }

  public async sendSummaryInformation(
    totalUnprocessedItems: number,
    totalStopsUploaded: number,
    errors: number,
    averageBatchSize: number,
  ): Promise<any> {
    if (!this.webhookUrl) {
      return;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cards: [
            this.generateSummaryCard(
              totalUnprocessedItems,
              totalStopsUploaded,
              averageBatchSize,
              errors,
            ),
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    } catch (error) {
      console.error('Error sending GChat notification:', error);
      throw error;
    }
  }
}

export default GChatService;
