// Local oxlint JS plugin: the two JSDoc checks the SDK relied on from eslint-plugin-jsdoc,
// which oxlint does not implement natively. eslint-plugin-jsdoc itself depends on
// @typescript-eslint/*, whose `typescript <6.1` peer range conflicts with TypeScript 7.

/** Statement-level node a doc comment for `node` is written before. */
function docAnchor(node) {
  let current = node;
  const parent = current.parent;
  if (parent?.type === "VariableDeclarator") {
    current = parent.parent;
  } else if (
    parent?.type === "Property" ||
    parent?.type === "MethodDefinition" ||
    parent?.type === "PropertyDefinition"
  ) {
    current = parent;
  }
  if (
    current.parent?.type === "ExportNamedDeclaration" ||
    current.parent?.type === "ExportDefaultDeclaration"
  ) {
    current = current.parent;
  }
  return current;
}

/** The `/** … *\/` comment directly above `anchor` (at most one line apart), or `null`. */
function jsdocBefore(sourceCode, anchor) {
  const comments = sourceCode.getCommentsBefore(anchor);
  const comment = comments.at(-1);
  if (!comment || comment.type !== "Block" || !comment.value.startsWith("*")) {
    return null;
  }
  return anchor.loc.start.line - comment.loc.end.line <= 1 ? comment : null;
}

const requireExportJsdoc = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Exported functions, classes, interfaces, type aliases and enums need a JSDoc comment"
    },
    schema: []
  },
  create(context) {
    const { sourceCode } = context;
    const check = (node) => {
      const declaration = node.declaration;
      if (!declaration) {
        return;
      }
      const checked = new Set([
        "FunctionDeclaration",
        "ClassDeclaration",
        "TSInterfaceDeclaration",
        "TSTypeAliasDeclaration",
        "TSEnumDeclaration"
      ]);
      if (!checked.has(declaration.type) || jsdocBefore(sourceCode, node)) {
        return;
      }
      context.report({ node: declaration, message: "Missing JSDoc comment." });
    };
    return { ExportNamedDeclaration: check, ExportDefaultDeclaration: check };
  }
};

/** Root parameter names; `null` for destructured parameters (any doc name is accepted). */
function parameterNames(fn) {
  const names = [];
  const params = fn.params ?? [];
  for (const param of params) {
    let target = param.type === "TSParameterProperty" ? param.parameter : param;
    if (target.type === "AssignmentPattern") {
      target = target.left;
    }
    if (target.type === "RestElement") {
      target = target.argument;
    }
    if (target.type === "Identifier") {
      if (target.name !== "this") {
        names.push(target.name);
      }
    } else {
      names.push(null);
    }
  }
  return names;
}

/** Top-level `@param` names in order (`options.timeZone` documents a property of `options`). */
function documentedNames(comment) {
  const names = [];
  const paramTags = comment.value.matchAll(/@param\s+(?:\{[^}]*\}\s*)?\[?([\w$]+)(\.[\w$.]+)?/g);
  for (const match of paramTags) {
    if (match[2] === undefined) {
      names.push(match[1]);
    }
  }
  return names;
}

const checkParamNames = {
  meta: {
    type: "problem",
    docs: { description: "`@param` names must match the function's parameters, in order" },
    schema: []
  },
  create(context) {
    const { sourceCode } = context;
    const check = (fn) => {
      const comment = jsdocBefore(sourceCode, docAnchor(fn));
      if (!comment) {
        return;
      }
      const actual = parameterNames(fn);
      const documented = documentedNames(comment);
      const seen = new Set();
      for (const [index, name] of documented.entries()) {
        if (seen.has(name)) {
          context.report({ node: fn, message: `Duplicate @param "${name}".` });
          continue;
        }
        seen.add(name);
        if (index >= actual.length) {
          context.report({
            node: fn,
            message: `@param "${name}" does not match an existing function parameter.`
          });
          continue;
        }
        const expected = actual[index];
        if (expected !== null && expected !== name) {
          context.report({
            node: fn,
            message: `Expected @param name "${expected}" at position ${index + 1}, got "${name}".`
          });
        }
      }
    };
    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
      TSDeclareFunction: check,
      TSMethodSignature: check
    };
  }
};

export default {
  meta: { name: "sdk-docs" },
  rules: {
    "require-export-jsdoc": requireExportJsdoc,
    "check-param-names": checkParamNames
  }
};
