# Kythe indexer for TypeScript

## Development

Install [yarn](https://yarnpkg.com/), then run it with no arguments to download
dependencies.

Run `yarn run build` to compile the TypeScript once.

Run `yarn run watch` to start the TypeScript compiler in watch mode, which
keeps the built program up to date.  Use this while developing.

Run `yarn run browse` to run the main binary, which opens the Kythe browser
against a sample file.  (You might need to set `$KYTHE` to your Kythe path
first.)

Run `yarn test` to run the test suite.  (You'll need to have built first.)

### Writing tests

By default in TypeScript, files are "scripts", where every declaration is in
the global scope.  If the file has any `import` or `export` declaration, they
become a "module", where declarations are local.  To make tests isolated from
one another, prefix each test with an `export {}` to make them modules.  In
larger TypeScript projects this doesn't come up because all files are modules.

## Design notes

### Choosing VNames

In code like:

```
let x = 3;
x;
```

the TypeScript compiler resolves the `x`s together into a single `Symbol`
object.  This concept maps nicely to Kythe's `VName` concept except that
`Symbol`s do not themselves have unique names.

You might at first think that you could just, at the `let x` line, choose
a name for the `Symbol` there and then reuse it for subsequent references.
But it's not guaranteed that you syntactically encounter a definition
before its use, because code like this is legal:

```
x();
function x() {}
```

So the current approach instead starts from the `Symbol`, then from
there jumps to the *declarations* of the `Symbol`, which then point to
syntactic positions (like the `function` above), and then from there
maps the declaration back to the containing scopes to choose a unique
name.

This seems to work so far but we might need to revisit it.  I'm not yet
clear on whether this approach is correct for symbols with declarations
in multiple modules, for example.
