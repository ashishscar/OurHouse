import application from '../dist/server/index.js';
import {standaloneWorker} from './worker.mjs';

export default standaloneWorker(application);

