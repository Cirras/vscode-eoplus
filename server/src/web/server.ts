import {
  createConnection,
  BrowserMessageReader,
  BrowserMessageWriter,
} from "vscode-languageserver/browser.js";
import { createServer } from "../common/server.js";

const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);

const connection = createConnection(messageReader, messageWriter);

createServer(connection);
