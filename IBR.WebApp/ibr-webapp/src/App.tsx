import { CSSProperties, useMemo, useRef, useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [json, setJson] = useState('{}');
  const [payloadInfo, setPayloadInfo] = useState<any>({});
  const onSelectPath = useRef<(jPath: string) => void>();
  const jsonObj = useMemo(() => {
    try {
      return JSON.parse(json);
    } catch {
      return {};
    }
  }, [json]);

  const onSetJPath = (key: string) => (jPath: string) => {
    setPayloadInfo((prev: any) => ({ ...prev, [key]: jPath }));
  }

  const renderJson = (obj: any, hasNext: boolean, parentPath?: string, propName?: string, idx?: number): any => {
    const currentPath = parentPath ? `${parentPath}.${propName || (Number.isInteger(idx) ? idx : '*')}` : '$';
    const prop = (propName &&
      <span onClick={(e) => {
        e.stopPropagation();
        onSelectPath.current && onSelectPath.current(`${parentPath}.*~`);
      }}>
        {JSON.stringify(propName)}:{' '}
      </span>
    );
    const comma = (hasNext && ',');
    const onClickValue = () => onSelectPath.current && onSelectPath.current(currentPath);
    const renderValue = (value: any) => (
      <div className='json-line' onClick={onClickValue}>
        {prop}<span className='json-token'>{value}</span>{comma}
      </div>
    );
    if (obj === null)
      return renderValue('null');
    if (typeof obj === 'undefined')
      return renderValue('undefined');
    if (typeof obj === 'boolean' || typeof obj === 'string')
      return renderValue(JSON.stringify(obj));

    const nestedStyle: Partial<CSSProperties> = { marginLeft: 20 };
    if (typeof obj === 'object') {
      if (Array.isArray(obj)) {
        return (
          <>
            <div className='json-line' onClick={onClickValue}>
              {prop}<span className='json-token'>{'['}</span>
            </div>
            {obj.map((item, idx) => (
              <div style={nestedStyle}>
                {renderJson(item, idx + 1 < obj.length, currentPath, undefined, idx)}
              </div>
            ))}
            <div className='json-line'>
              {']'}{comma}
            </div>
          </>
        )
      } else {
        const entries = Object.entries(obj);
        return (
          <>
            <div className='json-line' onClick={onClickValue}>
              {prop}<span className='json-token'>{'{'}</span>
            </div>
            {entries.map(([key, value], idx) => {
              return (
                <div style={nestedStyle}>
                  {renderJson(value, idx + 1 < entries.length, currentPath, key)}
                </div>
              );
            })}
            <div className='json-line'>
              {'}'}{comma}
            </div>
          </>
        )
      }
    }
    return renderValue(obj);
  }

  return (
    <>
      <div>
        <a href="https://vitejs.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <textarea
          style={{ width: '50vw', height: '30vh' }}
          onChange={(e) => setJson(e.target.value)} placeholder='Input JSON'></textarea>
        <hr />
        <div style={{ textAlign: 'left' }}>
          <form onSubmit={(e) => e.preventDefault()}>
            <div className='form-item'>
              <label>Device id</label>
              <input type='text' name='deviceId'
                readOnly value={payloadInfo.deviceId}
                onFocus={() => onSelectPath.current = onSetJPath('deviceId')}
              />
            </div>
            <div className='form-item'>
              <label>Metric key</label>
              <input type='text' name='metricKey'
                readOnly value={payloadInfo.metricKey}
                onFocus={() => onSelectPath.current = onSetJPath('metricKey')}
              />
            </div>
            <div className='form-item'>
              <label>Timestamp</label>
              <input type='text' name='timestamp'
                readOnly value={payloadInfo.timestamp}
                onFocus={() => onSelectPath.current = onSetJPath('timestamp')}
              />
            </div>
            <div className='form-item'>
              <label>Value</label>
              <input type='text' name='value'
                readOnly value={payloadInfo.value}
                onFocus={() => onSelectPath.current = onSetJPath('value')}
              />
            </div>
            <div className='form-item'>
              <label>Quality</label>
              <input type='text' name='quality'
                readOnly value={payloadInfo.quality}
                onFocus={() => onSelectPath.current = onSetJPath('quality')}
              />
            </div>
          </form>
        </div>
        <hr />
        <div style={{ textAlign: 'left' }}>
          {renderJson(jsonObj, false)}
        </div>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App
