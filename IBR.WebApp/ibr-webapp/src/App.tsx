import { ChangeEvent, CSSProperties, useMemo, useRef, useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { JSONPath } from 'jsonpath-plus';
import JsonView from '@uiw/react-json-view';
import { lightTheme } from '@uiw/react-json-view/light';

function App() {
  const [json, setJson] = useState('{}');
  const [payloadInfo, setPayloadInfo] = useState<any>({});
  const [previewResult, setPreviewResult] = useState<any>({});
  const onSelectPath = useRef<(jPath: string) => void>();
  const jsonObj = useMemo(() => {
    try {
      return JSON.parse(json);
    } catch {
      return {};
    }
  }, [json]);

  const setJPath = (key: string, jPath: string) => setPayloadInfo((prev: any) => ({ ...prev, [key]: jPath }));

  const onSetJPath = (key: string) => (jPath: string) => setJPath(key, jPath);
  const onJPathChange = (key: string) => (e: ChangeEvent<HTMLInputElement>) => setJPath(key, e.target.value);

  const onPreview = (key: string) => () => {
    try {
      const jsonPath = payloadInfo[key];
      if (!jsonPath) {
        setPreviewResult({});
        return;
      }

      let finalResult: any;
      if (jsonPath?.includes('{metric_key}')) {
        const metricKeys = JSONPath({ path: payloadInfo['metricKey'], json: jsonObj });
        finalResult = {};
        metricKeys.forEach((k: string) => {
          const mPath = jsonPath.replace('{metric_key}', k);
          const result = JSONPath({ path: mPath, json: jsonObj });
          finalResult[k] = result;
        });
      } else {
        finalResult = JSONPath({ path: jsonPath, json: jsonObj });
      }
      setPreviewResult(finalResult);
    } catch {
      setPreviewResult({});
    }
  }

  const onPreviewPayloadInfo = () => {
    setPreviewResult(payloadInfo);
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
              <div key={idx} style={nestedStyle}>
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
                <div key={idx} style={nestedStyle}>
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
        <div className='json-path-form-container'>
          <form className='json-path-form' onSubmit={(e) => e.preventDefault()}>
            <div className='form-item'>
              <label>Device id</label>
              <input type='text' name='deviceId'
                value={payloadInfo.deviceId || ''}
                onChange={onJPathChange('deviceId')}
                onFocus={() => onSelectPath.current = onSetJPath('deviceId')}
              />
              <button onClick={onPreview('deviceId')}>Preview</button>
            </div>
            <div className='form-item'>
              <label>Metric key</label>
              <input type='text' name='metricKey'
                value={payloadInfo.metricKey || ''}
                onChange={onJPathChange('metricKey')}
                onFocus={() => onSelectPath.current = onSetJPath('metricKey')}
              />
              <button onClick={onPreview('metricKey')}>Preview</button>
            </div>
            <div className='form-item'>
              <label>Timestamp</label>
              <input type='text' name='timestamp'
                value={payloadInfo.timestamp || ''}
                onChange={onJPathChange('timestamp')}
                onFocus={() => onSelectPath.current = onSetJPath('timestamp')}
              />
              <button onClick={onPreview('timestamp')}>Preview</button>
            </div>
            <div className='form-item'>
              <label>Value</label>
              <input type='text' name='value'
                value={payloadInfo.value || ''}
                onChange={onJPathChange('value')}
                onFocus={() => onSelectPath.current = onSetJPath('value')}
              />
              <button onClick={onPreview('value')}>Preview</button>
            </div>
            <div className='form-item'>
              <label>Quality</label>
              <input type='text' name='quality'
                value={payloadInfo.quality || ''}
                onChange={onJPathChange('quality')}
                onFocus={() => onSelectPath.current = onSetJPath('quality')}
              />
              <button onClick={onPreview('quality')}>Preview</button>
            </div>
            <br />
            <button onClick={onPreviewPayloadInfo}>Preview JPath</button>
          </form>
          <div className='json-path-preview'>
            <JsonView value={previewResult} style={lightTheme} displayDataTypes={false} />
          </div>
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
