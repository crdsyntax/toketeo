declare module 'echarts/dist/echarts.esm' {
  const echarts: {
    init: (dom: HTMLElement | null, theme?: object | string, opts?: object) => unknown
    use: (modules: unknown[] | unknown) => void
    dispose: (dom: HTMLElement) => void
    getInstanceByDom: (dom: HTMLElement) => unknown
    connect: (group: string | string[]) => void
    disconnect: (group: string) => void
    registerMap: (name: string, geoJSON: object) => void
    getMap: (name: string) => object
    readonly version: string
  }
  export default echarts
}
