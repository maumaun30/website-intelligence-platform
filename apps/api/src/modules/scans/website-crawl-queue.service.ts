import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { WEBSITE_CRAWL_QUEUE, type WebsiteCrawlJob } from '@wintel/types';
import { Queue } from 'bullmq';

/**
 * Producer side of crawling. `attempts: 1` is deliberate: a crawl that dies part-way has already
 * written pages, so a blind retry would collide with them. The scan row records the failure and
 * the user re-triggers.
 */
@Injectable()
export class WebsiteCrawlQueueService {
  constructor(@InjectQueue(WEBSITE_CRAWL_QUEUE) private readonly queue: Queue<WebsiteCrawlJob>) {}

  async enqueue(job: WebsiteCrawlJob): Promise<void> {
    await this.queue.add('crawl', job, { attempts: 1 });
  }
}
