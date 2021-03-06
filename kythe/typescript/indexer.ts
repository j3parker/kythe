/*
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import 'source-map-support/register';
import * as ts from 'typescript';

/** VName is the type of Kythe node identities. */
interface VName {
  signature: string;
  path: string;
  language: string;
  root: string;
  corpus: string;
}

/** Visitor manages the indexing process for a single TypeScript SourceFile. */
class Vistor {
  /** kFile is the VName for the source file. */
  kFile: VName;

  /** symbolNames maps ts.Symbol to their assigned VNames. */
  symbolNames = new Map<ts.Symbol, VName>();

  /**
   * anonId increments for each anonymous block, to give them unique
   * signatures.
   */
  anonId = 0;

  constructor(
      private typeChecker: ts.TypeChecker,
      /**
       * Path to the source file, for use in generated output.  Note
       * that sourceFile.sourcePath is the absolute path to the source
       * file, but for output purposes we want a repository-relative
       * path.
       */
      private sourcePath: string) {}

  /**
   * emit emits a Kythe entry, structured as a JSON object.  Defaults to
   * emitting to stdout but users may replace it.
   */
  emit =
      (obj: any) => {
        // TODO: allow control of where the output is produced.
        console.log(JSON.stringify(obj));
      }

  /** newVName returns a new VName pointing at the current file. */
  newVName(signature: string): VName {
    return {
      signature,
      path: this.sourcePath,
      language: 'typescript',
      root: '',
      corpus: 'TODO',
    };
  }

  /** newAnchor emits a new anchor entry that covers a TypeScript node. */
  newAnchor(node: ts.Node): VName {
    let name = this.newVName(`@${node.pos}:${node.end}`);
    this.emitNode(name, 'anchor');
    // TODO: loc/* should be in bytes, but these offsets are in UTF-16 units.
    this.emitFact(name, 'loc/start', node.getStart().toString());
    this.emitFact(name, 'loc/end', node.getEnd().toString());
    this.emitEdge(name, 'childof', this.kFile);
    return name;
  }

  /** emitNode emits a new node entry, declaring the kind of a VName. */
  emitNode(source: VName, kind: string) {
    this.emitFact(source, 'node/kind', kind);
  }

  /** emitFact emits a new fact entry, tying an attribute to a VName. */
  emitFact(source: VName, name: string, value: string) {
    this.emit({
      source,
      fact_name: '/kythe/' + name,
      fact_value: new Buffer(value).toString('base64'),
    });
  }

  /** emitEdge emits a new edge entry, relating two VNames. */
  emitEdge(source: VName, name: string, target: VName) {
    this.emit({
      source,
      edge_kind: '/kythe/edge/' + name, target,
      fact_name: '/',
    });
  }

  /**
   * scopedSignature computes a scoped name for a ts.Node.
   * E.g. if you have a function `foo` containing a block containing a variable
   * `bar`, it might return a string like foo.block0.bar.
   */
  scopedSignature(startNode: ts.Node): string {
    let parts: string[] = [];
    // Traverse the containing blocks upward, gathering names from nodes that
    // introduce scopes.
    for (let node: ts.Node|undefined = startNode; node != null;
         node = node.parent) {
      switch (node.kind) {
        case ts.SyntaxKind.Block:
          if (node.parent &&
              node.parent.kind === ts.SyntaxKind.FunctionDeclaration) {
            // A block that's an immediate child of a function is the
            // function's body, so it doesn't need a separate name.
            continue;
          }
          parts.push(`block${this.anonId++}`);
          break;
        case ts.SyntaxKind.FunctionDeclaration:
        case ts.SyntaxKind.Parameter:
        case ts.SyntaxKind.VariableDeclaration:
          let decl = node as ts.Declaration;
          if (decl.name && decl.name.kind === ts.SyntaxKind.Identifier) {
            parts.push(decl.name.text);
          } else {
            // TODO: handle other declarations, e.g. binding patterns.
            parts.push(`anon${this.anonId++}`);
          }
          break;
        case ts.SyntaxKind.SourceFile:
          // TODO: name the outermost signature after the module name, so that
          // cross-module references work.
          parts.push('TODOSourceFile');
          break;
        case ts.SyntaxKind.VariableDeclarationList:
        case ts.SyntaxKind.VariableStatement:
          break;
        default:
          // TODO: namespace {}, interface {}, etc.
          console.error('TODO(scopedSignature)', ts.SyntaxKind[node.kind]);
      }
    }

    // The names were gathered from bottom to top, so reverse before joining.
    return parts.reverse().join('.');
  }

  /** getSymbolName computes the VName (and signature) of a ts.Symbol. */
  getSymbolName(sym: ts.Symbol): VName {
    let vname = this.symbolNames.get(sym);
    if (vname) return vname;

    if (!sym.declarations || sym.declarations.length < 1) {
      throw new Error('TODO: symbol has no declarations?');
    }
    // TODO: think about symbols with multiple declarations.

    let decl = sym.declarations[0];
    let sig = this.scopedSignature(decl);
    vname = this.newVName(sig);
    this.symbolNames.set(sym, vname);
    return vname;
  }

  visitExportDeclaration(decl: ts.ExportDeclaration) {
    // TODO: this code doesn't do much yet, but it's enough to silence a TODO
    // that is printed in unrelated tests.
    if (decl.exportClause) {
      for (const element of decl.exportClause.elements) {
        console.warn(`TODO: handle export element in ${decl.getText()}`);
      }
    }
    if (decl.moduleSpecifier) {
      console.warn(`TODO: handle module specifier in ${decl.getText()}`);
    }
  }

  visitVariableDeclaration(decl: ts.VariableDeclaration) {
    if (decl.name.kind === ts.SyntaxKind.Identifier) {
      let sym = this.typeChecker.getSymbolAtLocation(decl.name);
      let kVar = this.getSymbolName(sym);
      this.emitNode(kVar, 'variable');

      this.emitEdge(this.newAnchor(decl.name), 'defines/binding', kVar);
    } else {
      console.warn(
          'TODO: handle variable declaration:', ts.SyntaxKind[decl.name.kind]);
    }
    if (decl.initializer) this.visit(decl.initializer);
  }

  visitFunctionDeclaration(decl: ts.FunctionDeclaration) {
    let kFunc: VName;
    if (decl.name) {
      let sym = this.typeChecker.getSymbolAtLocation(decl.name);
      kFunc = this.getSymbolName(sym);
      this.emitNode(kFunc, 'function');

      this.emitEdge(this.newAnchor(decl.name), 'defines/binding', kFunc);
    } else {
      // TODO: choose VName for anonymous functions.
      kFunc = this.newVName('TODO');
    }

    for (const [index, param] of decl.parameters.entries()) {
      let sym = this.typeChecker.getSymbolAtLocation(param.name);
      let kParam = this.getSymbolName(sym);
      this.emitNode(kParam, 'variable');
      this.emitEdge(kFunc, `param.${index}`, kParam);

      this.emitEdge(this.newAnchor(param.name), 'defines/binding', kParam);
    }

    if (decl.body) this.visit(decl.body);
  }

  /** visit is the main dispatch for visiting AST nodes. */
  visit(node: ts.Node): void {
    switch (node.kind) {
      case ts.SyntaxKind.ExportDeclaration:
        return this.visitExportDeclaration(node as ts.ExportDeclaration);
      case ts.SyntaxKind.VariableDeclaration:
        return this.visitVariableDeclaration(node as ts.VariableDeclaration);
      case ts.SyntaxKind.FunctionDeclaration:
        return this.visitFunctionDeclaration(node as ts.FunctionDeclaration);
      case ts.SyntaxKind.Identifier:
        // Assume that this identifer is occurring as part of an
        // expression; we'll handle identifiers that occur in other
        // circumstances (e.g. in a type) separately.
        let sym = this.typeChecker.getSymbolAtLocation(node);
        let name = this.getSymbolName(sym);
        this.emitEdge(this.newAnchor(node), 'ref', name);
        return;
      case ts.SyntaxKind.BinaryExpression:
      case ts.SyntaxKind.Block:
      case ts.SyntaxKind.CallExpression:
      case ts.SyntaxKind.EndOfFileToken:
      case ts.SyntaxKind.ExpressionStatement:
      case ts.SyntaxKind.NumericLiteral:
      case ts.SyntaxKind.PlusToken:
      case ts.SyntaxKind.PostfixUnaryExpression:
      case ts.SyntaxKind.VariableDeclarationList:
      case ts.SyntaxKind.VariableStatement:
        // Use default recursive processing.
        return ts.forEachChild(node, n => this.visit(n));
      default:
        console.warn(`TODO: handle input node: ${ts.SyntaxKind[node.kind]}`);
    }
  }

  /** indexFile is the main entry point, starting the recursive visit. */
  indexFile(file: ts.SourceFile) {
    this.kFile = this.newVName(/* empty signature */ '');
    this.kFile.language = '';
    this.emitFact(this.kFile, 'node/kind', 'file');
    this.emitFact(this.kFile, 'text', file.text);
    ts.forEachChild(file, n => this.visit(n));
  }
}

/**
 * index indexes a TypeScript program, producing Kythe JSON objects for the
 * source file in the specified path.
 *
 * (A ts.Program is a configured collection of parsed source files, but
 * the caller must specify the source files within the program that they want
 * Kythe output for, because e.g. the standard library is contained within
 * the Program and we only want to process it once.)
 *
 * @param emit If provided, a function that receives objects as they
 */
export function index(
    path: string, program: ts.Program, emit?: (obj: any) => void) {
  let diags = ts.getPreEmitDiagnostics(program);
  if (diags.length > 0) {
    let message = ts.formatDiagnostics(diags, {
      getCurrentDirectory() {
        return process.cwd();
      },
      getCanonicalFileName(fileName: string) {
        return fileName;
      },
      getNewLine() {
        return '\n';
      },
    });
    throw new Error(message);
  }
  let sourceFile = program.getSourceFile(path);
  let visitor = new Vistor(program.getTypeChecker(), path);
  if (emit != null) {
    visitor.emit = emit;
  }
  visitor.indexFile(sourceFile);
}

function main(argv: string[]) {
  if (argv.length !== 3) {
    console.error('usage: indexer path.ts');
    return 1;
  }
  let inPath = argv[2];
  // TODO: accept compiler options from the user.
  // These options are just enough to get indexer.ts itself indexable.
  let tsOpts: ts.CompilerOptions = {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2015,
    // NOTE: the 'lib' parameter in tsconfig.json is translated by the 'tsc'
    // command-line parser into one of these values, which are what the compiler
    // uses internally.  This is just enough to get this indexer.ts to be able
    // to load itself for debugging.
    lib: ['lib.es6.d.ts'],
  };
  let program = ts.createProgram([inPath], tsOpts);
  index(inPath, program);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}
