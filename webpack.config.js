const path = require('path');
const webpack = require('webpack');

module.exports = {
    target: 'node',
    entry: './extension.js',
    output: {
        path: path.resolve(__dirname, './'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2',
    },
    externals: {
        vscode: 'commonjs vscode',
    },
    resolve: {
        extensions: ['.js'],
        preferRelative: true,
        modules: [path.resolve(__dirname, 'generated-cjs'), 'node_modules'],
    },
};
