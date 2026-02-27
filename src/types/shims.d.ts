declare module 'd3-force-3d' {
    export * from 'd3-force';
    export const forceSimulation: any;
    export const forceCenter: any;
    export const forceLink: any;
    export const forceManyBody: any;
}

declare module '@babel/traverse' {
    const traverse: any;
    export default traverse;
    export const visitors: any;
}
