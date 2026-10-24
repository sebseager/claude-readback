// Web worker: parse + fold + index + IndexedDB, exposed over comlink. See client.ts.
import { expose } from 'comlink'
import { TranscriptService } from './service'

expose(new TranscriptService())
