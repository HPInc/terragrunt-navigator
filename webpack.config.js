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
        extensions: ['.js', '.mjs'],
        preferRelative: true,
        fallback: {
            fs: false,
        },
        modules: ['generated-cjs', 'node_modules'],
    },
    module: {
        rules: [
            {
                test: /\.mjs$/,
                include: /node_modules/,
                type: 'javascript/auto',
            },
        ],
    },
};
