<p align="center">
<h1 align="center">package-size</h1>
</p>

<p align="center">
<a href="https://npmjs.com/package/package-size"><img src="https://img.shields.io/npm/v/package-size.svg?style=flat" alt="NPM version" /></a> <a href="https://npmjs.com/package/package-size"><img src="https://img.shields.io/npm/dm/package-size.svg?style=flat" alt="NPM downloads" /></a> <a href="https://circleci.com/gh/egoist/package-size"><img src="https://img.shields.io/circleci/project/egoist/package-size/master.svg?style=flat" alt="Build Status" /></a> <a href="https://github.com/egoist/donate"><img src="https://img.shields.io/badge/$-donate-ff69b4.svg?maxAge=2592000&amp;style=flat" alt="donate" /></a>
</p>

<p align="center">
<img src="./media/preview.gif" alt="preview" width="700">
</p>

## How does this work?

1. Install the packages with yarn or npm in a temp directory
2. Bundle the packages with webpack and get the bundle size
3. Show you the bundle size and cache it by package version

## Install

```bash
yarn global add package-size
```

## Usage

The package is bundled with Webpack.

```bash
# get the size of vue bundle
package-size vue

# get the size of react+react-dom bundle
package-size react,react-dom

# get the size of vue react+react-dom preact bundles
package-size vue react,react-dom preact

# get the size of react+react-dom without using the cache
package-size react,react-dom --no-cache

# get the size of file in current working directory
package-size ./dist/index.js
# or a package in current working directory, explictly using `--cwd` flag
package-size vue --cwd

# or event multiple versions for the same package!
package-size react@0.10 react@0.14 react@15

# save results to file system in JSON format
# defaults to ./package-size-output.json
package-size cherow --output
# or custom path
package-size cherow --output stats.json

# analyze bundle with webpack-bundle-analyzer
package-size cherow --analyze
# analyze bundle with webpack-bundle-analyzer on a different port
package-size cherow --analyze --port 9000
```

## API

```js
const getSizes = require('package-size')

getSizes('react,react-dom', options)
  .then(data => {
    console.log(data)
    //=>
    {
      name: 'react,react-dom',
      size: 12023, // in bytes
      minified: 2342,
      gzipped: 534,
      versionedName: 'react@16.0.0,react-dom@16.0.0'
    }
  })
```

### options

#### sort

Type: `boolean`<br>
Default: `false`

Sort packages in size (from small to large).

#### cwd

Type: `boolean`<br>
Default: `false`

Resolve modules in current working directory instead of a cache folder. Relative path will set `cwd` to `true` by default.

#### externals

Type: `string` or `Array<string|RegExp>`<br>
Default: `undefined`

The package to exclude from bundled file, for example, to get the bundle size of `styled-jsx/style` we need to exclude `react`:

```bash
package-size styled-jsx/style --externals react
```

Note that if some item in `externals` is provided as string, it will be wrapped in a regular expression. For example: `react` is treated as `/^react$/`

#### cache

Type: `boolean`<br>
Default: `true`

If `cache` is set to `false`, then package-size will not use cached build sizes. To use this from the CLI, pass `--no-cache` as an argument.

#### target

Type: `string`<br>
Default: `browser`
Values: `browser` `node`

Build target. In `node` target, all node_modules will be excluded and output format is set to CommonJS.

#### registry

Type: `string`<br>
Default: `undefined`

npm registry to install the package from. By default it uses the default npm registry.

#### resolve

Type: `string`<br>
Default: `undefined`

Extra folders to resolve local node_modules from.

## Contributing

1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request :D

## Author

**package-size** © [EGOIST](https://github.com/egoist), Released under the [MIT](https://egoist.mit-license.org/) License.<br>
Authored and maintained by EGOIST with help from contributors ([list](https://github.com/egoist/package-size/contributors)).

> [egoist.moe](https://egoist.moe) · GitHub [@egoist](https://github.com/egoist) · Twitter [@_egoistlily](https://twitter.com/_egoistlily)
