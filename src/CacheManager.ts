import _ from 'lodash'
import Dexie from 'dexie';

class SyncCache {

  public namespace: string = ''
  public instance: any

  constructor(namespace: string) {
    if (namespace) {
      this.namespace = namespace
    }
  }

  public get(): object | undefined {

    try {

      if (typeof this.instance.getItem === 'function') {

        return JSON.parse(this.instance.getItem(this.namespace) || '{}')
      }

    } catch (error) {

      throw new Error('Get Failed! Please check your data.' + error.message)

    }
    return undefined
  }

  /**
   * add
  : void  */
  public add(values: any): void {

    if (typeof this.instance.setItem !== 'function') {
      throw new Error('Add Failed! Please check your instance.')
    }

    try {

      const data = this.get() || {}

      this.instance.setItem(this.namespace, JSON.stringify({ ...data, ...values }))

    } catch (error) {

      throw new Error('Add Failed! Please check your data.' + error.message)

    }
  }

  /**
   * update
  : void  */
  update(values: any, key?: string,): void {

    if (typeof this.instance.setItem !== 'function') {
      throw new Error('Update Failed! Please check your instance.')
    }

    try {

      this.instance.setItem(this.namespace, JSON.stringify(values))

    } catch (error) {

      throw new Error('Update Failed! Please check your data' + error.message)

    }
  }

  /**
   * delete
  : void  */
  delete(key?: string): void {

    if (typeof this.instance.removeItem !== 'function') {
      throw new Error('Update Failed! Please check your instance.')
    }

    this.instance.removeItem(this.namespace)
  }
}

class LocalCache extends SyncCache {

  constructor(namespace: string) {
    super(namespace)

    this.instance = localStorage
  }

}

class SessionCache extends SyncCache {

  constructor(namespace: string) {
    super(namespace)

    this.instance = sessionStorage
  }
}


class DbCache {
  public namespace: string = ''
  public instance: any
  public db: Dexie;
  public dataKeys: string[] = [];
  public count: number = 3

  constructor(namespace: string, dataKeys: string[]) {

    if (namespace) {
      this.namespace = namespace
    }

    this.db = new Dexie(this.namespace)

    if (dataKeys && dataKeys.length > 0) {
      this.dataKeys = dataKeys
    }

    this.db.version(1).stores({
      [this.namespace]: dataKeys.join(', ')
    })

    // @ts-ignore
    this.instance = this.db[this.namespace]

    this.db.transaction('rw', this.instance, async () => {

      const res =  await this.instance.get('2241003002')
      return res
    })
  }

  public async get(primaryKey: string): Promise<any> {

    if (!primaryKey) {
      return Promise.reject('Please input correct primaryKey')
    }

    return this.db.transaction('r', this.instance, async () => {

      const res =  await this.instance.get(primaryKey)

      console.log('### get', primaryKey, this.namespace, res)
      
      return res
    })
  }

  private async addInTable(values: object): Promise<any> {
    try {

      return await this.instance.add(values)

    } catch (error) {

      await this.instance.delete()
      return await this.addInTable(values)

    }
  }

  public async add(values: object): Promise<any> {

    if (!values || JSON.stringify(values) === '{}') {
      return Promise.reject('Please add correct data')
    }

    return this.db.transaction('rw', this.instance, async () => {

      return await this.addInTable(values)
    })
  
  }


  public delete(primaryKey: string): Promise<any> {

    if (!primaryKey) {

      return Promise.reject('Please add correct data')
    }

    return this.db.transaction('rw', this.instance, async () => {

      await this.instance.delete(primaryKey)

      return true
    })
  }

  public update(values: object, primaryKey?: string): Promise<any> {

    if (!values || !primaryKey || JSON.stringify(values) === '{}') {

      return Promise.reject('Please add correct data')
    }

    return this.db.transaction('rw', this.instance, async () => {

      if ( await this.instance.get(primaryKey)) {

        await this.instance.update(primaryKey, { primaryKey, ...values,  t: Date.now()})

      } else {

        const addData = { primaryKey, ...values, t: Date.now()}

        await this.addInTable(addData)

      } 
      
      return true
    })
  }

  clear() {
    this.db.delete()
  }
}


interface CacheManagerInterface {
  isSingle?: boolean;
  clearBeforeClosed?: boolean;
  namespace: string;
  dataKeys?: string[];
}


export default class CacheManager {

  public isSingle: boolean = true
  public clearBeforeClosed: boolean = false
  public cache: LocalCache | SessionCache | DbCache
  public namespace: string = ''
  public dataKeys?: string[] = []

  constructor(options: CacheManagerInterface) {

    // input options
    const {
      isSingle = true,
      clearBeforeClosed = false,
      namespace = '',
      dataKeys = [],
    } = options || {}

    this.isSingle = isSingle

    this.clearBeforeClosed = clearBeforeClosed

    if (!namespace) {
      throw new Error('Please set a namespace for the cache')
    }

    this.namespace = namespace

    if (this.isSingle) {

      this.cache = this.clearBeforeClosed ? new SessionCache(namespace) : new LocalCache(namespace)

    } else {

      this.dataKeys = dataKeys
      this.cache = new DbCache(namespace, dataKeys)

      if (this.clearBeforeClosed) {

        const that = this
        window.onbeforeunload = function() {
          (that.cache as DbCache).clear()
        }
      }
    }
  }


  public get(key?: string): any {

    return this.cache.get(key as string)
  }

  public add(values: any): void {
    this.cache.add(values)
  }


  public delete(key?: string): void {
    if (key) {
      this.cache.delete(key)
    }
    throw new Error('Please input correct primaryKey ')

  }

  public update(values: object, key?: string): void {
    this.cache.update(values, key)
  }

}
