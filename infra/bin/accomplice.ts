#!/usr/bin/env node
import { App, Tags } from 'aws-cdk-lib';
import { AccompliceStack } from '../lib/accomplice-stack.js';

const app = new App();
const region = app.node.tryGetContext('region') ?? 'ap-south-1';

const stack = new AccompliceStack(app, 'Accomplice', {
  // The account comes from the logged in AWS CLI profile. It is needed for the CloudFront prefix list lookup.
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region },
  description: 'Accomplice mystery party game: Fargate game server behind CloudFront, DynamoDB, S3, Polly, Transcribe, Translate.',
});
Tags.of(stack).add('project', 'accomplice');
