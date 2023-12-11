"use strict";

const path = require("path");
const webpack = require("webpack");
const { merge } = require("webpack-merge");
const TerserPlugin = require("terser-webpack-plugin");

const baseConfig = {
  context: __dirname,
  mode: "none",
  output: {
    filename: "[name].js",
    path: path.join(__dirname, "./dist"),
    libraryTarget: "commonjs",
    devtoolModuleFilenameTemplate: "../[resource-path]",
  },
  resolve: {
    conditionNames: ["import", "require"],
    mainFields: ["module", "main"],
    extensions: [".ts", ".js"],
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
            options: {
              compilerOptions: {
                sourceMap: true,
              },
            },
          },
        ],
      },
    ],
  },
  externals: {
    vscode: "commonjs vscode",
  },
  performance: {
    hints: false,
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        parallel: true,
        terserOptions: {
          compress: false,
        },
      }),
    ],
  },
  devtool: "source-map",
};

const webConfig = merge(baseConfig, {
  target: "webworker",
  resolve: {
    mainFields: ["browser", "module", "main"],
    extensions: [".ts", ".js"],
    fallback: {
      assert: require.resolve("assert"),
    },
  },
});

const nodeConfig = merge(baseConfig, {
  target: "node",
});

const extensionWeb = merge(webConfig, {
  entry: {
    "extension-web": "./client/src/web/extension.ts",
  },
});

const extensionNode = merge(nodeConfig, {
  entry: {
    "extension-node": "./client/src/node/extension.ts",
  },
});

const serverNode = merge(nodeConfig, {
  entry: {
    "server-node": "./server/src/node/server.ts",
  },
});

const serverWeb = merge(webConfig, {
  target: "webworker",
  entry: {
    "server-web": "./server/src/web/server.ts",
  },
  output: {
    libraryTarget: "var",
    library: "serverExportVar",
  },
});

module.exports = [extensionNode, extensionWeb, serverNode, serverWeb];
