import { Project, SyntaxKind, Node } from 'ts-morph';
import * as fs from 'node:fs';
import * as path from 'node:path';

const deps = {
    fs,
    path,
    Project,
};

export { deps };

export function extractTargetSymbol(projectRoot: string, filePath: string, symbolName: string): string | null {
    const fullPath = deps.path.resolve(projectRoot, filePath);
    if (!deps.fs.existsSync(fullPath)) {
        return null;
    }

    const project = new deps.Project();
    const sourceFile = project.addSourceFileAtPath(fullPath);

    // Find the symbol
    const functionDecl = sourceFile.getFunction(symbolName);
    if (functionDecl) {
        return functionDecl.getText();
    }

    const classDecl = sourceFile.getClass(symbolName);
    if (classDecl) {
        return classDecl.getText();
    }

    const variableDecl = sourceFile.getVariableDeclaration(symbolName);
    if (variableDecl) {
        return variableDecl.getParent().getParent().getText(); // Get the full statement
    }

    return null;
}

export function injectTargetSymbol(projectRoot: string, filePath: string, symbolName: string, newContent: string): boolean {
    const fullPath = deps.path.resolve(projectRoot, filePath);
    if (!deps.fs.existsSync(fullPath)) {
        return false;
    }

    const project = new deps.Project();
    const sourceFile = project.addSourceFileAtPath(fullPath);

    let replaced = false;

    const functionDecl = sourceFile.getFunction(symbolName);
    if (functionDecl) {
        functionDecl.replaceWithText(newContent);
        replaced = true;
    }

    if (!replaced) {
        const classDecl = sourceFile.getClass(symbolName);
        if (classDecl) {
            classDecl.replaceWithText(newContent);
            replaced = true;
        }
    }

    if (!replaced) {
        const variableDecl = sourceFile.getVariableDeclaration(symbolName);
        if (variableDecl) {
             const statement = variableDecl.getParent().getParent();
             statement.replaceWithText(newContent);
             replaced = true;
        }
    }

    if (replaced) {
        sourceFile.saveSync();
        return true;
    }

    return false;
}

export function buildSkeletonContext(projectRoot: string, filePath: string, preserveSymbol?: string): string | null {
    const fullPath = deps.path.resolve(projectRoot, filePath);
    if (!deps.fs.existsSync(fullPath)) {
        return null;
    }

    const project = new deps.Project();
    const sourceFile = project.addSourceFileAtPath(fullPath);

    // Strip bodies of functions
    sourceFile.getFunctions().forEach(func => {
        if (preserveSymbol && func.getName() === preserveSymbol) {
            return;
        }
        const body = func.getBody();
        if (body) {
            body.replaceWithText('{ /* ...omitted... */ }');
        }
    });

    // Strip bodies of methods in classes
    sourceFile.getClasses().forEach(cls => {
        if (preserveSymbol && cls.getName() === preserveSymbol) {
            return;
        }
        cls.getMethods().forEach(method => {
            if (preserveSymbol && method.getName() === preserveSymbol) {
                return;
            }
            const body = method.getBody();
            if (body) {
                body.replaceWithText('{ /* ...omitted... */ }');
            }
        });
    });

    return sourceFile.getText();
}
