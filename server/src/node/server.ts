import {
  ProposedFeatures,
  createConnection,
} from "vscode-languageserver/node.js";
import { createServer } from "../common/server.js";

const connection = createConnection(ProposedFeatures.all);

createServer(connection);
