export class LogStream {
  private eventSource: EventSource | null = null;
  private url: string = '';

  constructor(private options: {
    url: string;
    onLog: (entry: any) => void;
    onSnapshot?: (entries: any[], cursor: any, total: number) => void;
    onError?: (error: string) => void;
    onReconnect?: () => void;
  }) {}

  connect(): void {
    this.url = this.options.url;
    this.eventSource = new EventSource(this.url);

    this.eventSource.addEventListener('log', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        this.options.onLog(data);
      } catch (err) {
        console.error('Failed to parse log event', err);
      }
    });

    this.eventSource.addEventListener('snapshot', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        if (this.options.onSnapshot) {
          this.options.onSnapshot(data.hits, data.cursor, data.total);
        }
      } catch (err) {
        console.error('Failed to parse snapshot event', err);
      }
    });

    this.eventSource.addEventListener('error', () => {
      if (this.options.onError) {
        this.options.onError('SSE connection error');
      }
      // EventSource natively handles reconnection, but we can notify UI
      if (this.options.onReconnect) {
        this.options.onReconnect();
      }
    });
  }

  close(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  reconnect(newUrl: string): void {
    this.close();
    this.url = newUrl;
    this.connect();
  }
}
