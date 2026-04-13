#!/usr/bin/env node
'use strict';

const { createApp } = require('../src/app');

const debug = process.argv.includes('--debug');
createApp({ debug });
