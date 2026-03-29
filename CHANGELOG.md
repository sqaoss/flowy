# 1.0.0 (2026-03-29)


### Bug Fixes

* **ci:** add Node.js 22 setup for semantic-release ([996af07](https://github.com/sqaoss/flowy/commit/996af0785f0f2ea6d3ef1167c896fbac1a5f643d))
* **ci:** enable npm OIDC trusted publishing with provenance ([d6928b5](https://github.com/sqaoss/flowy/commit/d6928b562ced1c675f9ea911a425cd1e0953a0bd))
* **ci:** fix Reporter type error, remove tdd-guard from git, gitignore it ([2d0db79](https://github.com/sqaoss/flowy/commit/2d0db797af3e93e80981ccf838eeebb8f1ab46f2))
* **ci:** regenerate lockfiles and add test job to CI ([9e956bc](https://github.com/sqaoss/flowy/commit/9e956bc41993abc99960e1e90be2c946a22f7752))
* **ci:** restore NPM_TOKEN for semantic-release (OIDC not supported by plugin) ([0dee5ca](https://github.com/sqaoss/flowy/commit/0dee5ca4028e56abd3e28db4b6002f738d47ae64))
* **ci:** skip tdd-guard reporter in CI and remove hardcoded path ([c824298](https://github.com/sqaoss/flowy/commit/c82429873e380d45a39e5dc59cd5d0e72f174caa))
* re-enabled tdd-guard ([8265cbe](https://github.com/sqaoss/flowy/commit/8265cbe664a22b95338382f0447eb45666cda5fc))
* **server:** add input validation for 8 defects ([4977ce4](https://github.com/sqaoss/flowy/commit/4977ce4862a87f129c466b1b35765189c4cf5370))
* **server:** align schema and resolvers with CLI's GraphQL queries ([4084f91](https://github.com/sqaoss/flowy/commit/4084f91cd830bc2e88272db3675a9c35ea2a0c39))
* **server:** correct conflicting schema test from concurrent agent ([f0666b3](https://github.com/sqaoss/flowy/commit/f0666b3b215089a4f30d1226dcd1ad4c25090832))
* **server:** fix TypeScript errors and type safety in resolvers ([ee70d38](https://github.com/sqaoss/flowy/commit/ee70d3871302523f83404ac71690936cc411176d))
* **server:** use Bun 1.3.11 in Dockerfile ([98dbacc](https://github.com/sqaoss/flowy/commit/98dbacc4e1b904d167f1f122e318141ceb2b54b8))


### Features

* add config system, description resolver, vitest, simplify tree ([d0b5fd3](https://github.com/sqaoss/flowy/commit/d0b5fd327d3ab37687d60669cde9879ffa863de4))
* add domain-driven commands (setup, client, project, feature, task) ([4816e69](https://github.com/sqaoss/flowy/commit/4816e69e2e5a3aea179c9a6766d42d118da83e57))
* add TanStack Intent integration for auto-discoverable skill ([a48960b](https://github.com/sqaoss/flowy/commit/a48960b4a2ffed8a11e9192ecd4ae021a871291e))
* init claude ([ec70050](https://github.com/sqaoss/flowy/commit/ec7005011ed5dd7a57ce696f24f368d8e6180110))
* initial CLI extraction from SQA-and-automation/flowy ([338aee5](https://github.com/sqaoss/flowy/commit/338aee5ae38e6f87ce588462ba918433b5baa0a7))
* **server:** add Dockerfile and docker-compose.yml for local mode ([c5fe911](https://github.com/sqaoss/flowy/commit/c5fe9114d3f5c9c9adee6a4f71d1b906ce0de87d))
* **server:** add GraphQL SDL schema definition ([7a2c9d1](https://github.com/sqaoss/flowy/commit/7a2c9d13168d8d5bdde9c6424569d8edee0fdbae))
* **server:** add node resolvers with createNode, node, nodes, updateNode ([d07c9bb](https://github.com/sqaoss/flowy/commit/d07c9bb0535dc3c965786df676dfc88c99e55542))
* **server:** add SQLite database layer with schema and constraints ([f9506d8](https://github.com/sqaoss/flowy/commit/f9506d8856f2f518e888058f216207debd7cf08e))
* **server:** scaffold local GraphQL server project ([d4e11a6](https://github.com/sqaoss/flowy/commit/d4e11a612f35e0ce20bb63e7a42ceec39f91e04d))
* wire new commands, remove node/edge/register ([0fd8c89](https://github.com/sqaoss/flowy/commit/0fd8c8969531b10108dc40b0bdb6b45d7ca4291e))
* wire resolvers into server, verify startup and all tests pass ([f52baa6](https://github.com/sqaoss/flowy/commit/f52baa6ec1e4500a722182647dedf0ee4f9befd3))
