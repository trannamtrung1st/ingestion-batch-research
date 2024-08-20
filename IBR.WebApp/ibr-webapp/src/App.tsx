import { CSSProperties, useMemo, useRef, useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.scss'
import { JSONPath } from 'jsonpath-plus';
import JsonView from '@uiw/react-json-view';
import { Button, Col, Divider, Form, Input, message, Row, Space, Typography, Upload } from 'antd';
import { EyeOutlined, UploadOutlined } from '@ant-design/icons';
import { readFileAsString } from './utils/common-utils';
import { basicTheme } from '@uiw/react-json-view/basic';

const { Title } = Typography;

interface IJsonPathPayloadInfo {
  deviceId: string;
  metricKey: string;
  timestamp: string;
  value: string;
  quality?: string;
}

interface IPublishForm {
  file: File;
}

function App() {
  const [publishForm] = Form.useForm<IPublishForm>();
  const [payloadInfoForm] = Form.useForm<IJsonPathPayloadInfo>();
  const [json, setJson] = useState('{}');
  const [previewResult, setPreviewResult] = useState<any>({});
  const onSelectPath = useRef<(jPath: string) => void>();
  const jsonObj = useMemo(() => {
    try {
      return JSON.parse(json);
    } catch {
      return {};
    }
  }, [json]);

  const setJPath = (key: keyof IJsonPathPayloadInfo, jPath: string) => payloadInfoForm.setFieldValue(key, jPath);
  const onSetJPath = (key: keyof IJsonPathPayloadInfo) => (jPath: string) => setJPath(key, jPath);

  const onPreview = (key: keyof IJsonPathPayloadInfo) => () => {
    try {
      const jsonPath = payloadInfoForm.getFieldValue(key);
      if (!jsonPath) {
        setPreviewResult({});
        return;
      }

      let finalResult: any;
      if (jsonPath?.includes('{metric_key}')) {
        const metricKeysPath = payloadInfoForm.getFieldValue('metricKey');
        const metricKeys = JSONPath({ path: metricKeysPath, json: jsonObj });
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
    setPreviewResult(payloadInfoForm.getFieldsValue());
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

  const handlePublish = (func: () => Promise<Response | undefined | null>) => async () => {
    try {
      const result = await func();
      if (!result) return;
      if (!result.ok)
        throw Error(result.statusText);
      message.success('Successful!');
    } catch (e) {
      console.error(e);
      message.error("Something's wrong!");
    }
  }

  const onPublishSingle = async () => {
    const url = new URL('/api/publish-single', import.meta.env.VITE_BASE_API);
    return await fetch(url, {
      method: 'post'
    });
  }

  const onPublishMultiple = async () => {
    const url = new URL('/api/publish-multiple?batchSize=10', import.meta.env.VITE_BASE_API);
    return await fetch(url, {
      method: 'post'
    });
  }

  const onPublishCsv = async () => {
    const url = new URL('/api/publish-batch-csv', import.meta.env.VITE_BASE_API);
    const file = publishForm.getFieldValue('file');
    if (!file)
      return null;

    const formData = new FormData();
    formData.append('file', file);
    return await fetch(url, {
      method: 'post',
      body: formData
    });
  }

  const onPublishBatchWithJsonPath = async () => {
    const url = new URL('/api/publish-batch-with-json-path', import.meta.env.VITE_BASE_API);
    const file = publishForm.getFieldValue('file');
    const payloadInfo = payloadInfoForm.getFieldsValue();
    if (!file || !payloadInfo)
      return null;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('payloadInfoJson', JSON.stringify(payloadInfo));
    return await fetch(url, {
      method: 'post',
      body: formData
    });
  }

  return (
    <div>
      <div className='flex justify-center mb-3'>
        <a href="https://vitejs.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <div className='mx-3'></div>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <Title level={1}>Batch Ingestion</Title>
      <Form
        layout={'inline'}
        form={publishForm}
        initialValues={{}}
      >
        <Form.Item<IPublishForm>
          label="Payload"
          getValueProps={() => ({})}
          shouldUpdate={(prev, cur) => prev.file != cur.file}
        >
          {(form) => {
            const file = form.getFieldValue('file');
            return (
              <Upload
                multiple={false}
                beforeUpload={() => false} name="file" listType="text"
                fileList={file && [file]}
                onChange={async (e) => {
                  const file = e.file as any as File;
                  const fileContent = file && await readFileAsString(file);
                  setJson(fileContent || '{}');
                  form.setFieldsValue({ file });
                }}
              >
                <Button icon={<UploadOutlined />}>Click to upload</Button>
              </Upload>
            )
          }}
        </Form.Item>
        <Form.Item shouldUpdate>
          {() => (
            <Space>
              <Button type="primary" onClick={handlePublish(onPublishSingle)}>
                Publish single
              </Button>
              <Button type="primary" onClick={handlePublish(onPublishMultiple)}>
                Publish multiple
              </Button>
              <Button type="primary" onClick={handlePublish(onPublishCsv)}>
                Publish CSV
              </Button>
              <Button type="primary" onClick={handlePublish(onPublishBatchWithJsonPath)}>
                Publish JSON path
              </Button>
            </Space>
          )}
        </Form.Item>
      </Form>
      <Divider>JSON path builder</Divider>
      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Form
            labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}
            layout={'horizontal'}
            form={payloadInfoForm}
            initialValues={{}}
          >
            <Form.Item label="Device id" name="deviceId">
              <Input
                onFocus={() => onSelectPath.current = onSetJPath('deviceId')}
                addonAfter={<EyeOutlined className='cursor-pointer' onClick={onPreview('deviceId')} />}
              />
            </Form.Item>
            <Form.Item label="Metric key" name="metricKey">
              <Input
                onFocus={() => onSelectPath.current = onSetJPath('metricKey')}
                addonAfter={<EyeOutlined className='cursor-pointer' onClick={onPreview('metricKey')} />}
              />
            </Form.Item>
            <Form.Item label="Timestamp" name="timestamp">
              <Input
                onFocus={() => onSelectPath.current = onSetJPath('timestamp')}
                addonAfter={<EyeOutlined className='cursor-pointer' onClick={onPreview('timestamp')} />}
              />
            </Form.Item>
            <Form.Item label="Value" name="value">
              <Input
                onFocus={() => onSelectPath.current = onSetJPath('value')}
                addonAfter={<EyeOutlined className='cursor-pointer' onClick={onPreview('value')} />}
              />
            </Form.Item>
            <Form.Item label="Quality" name="quality">
              <Input
                onFocus={() => onSelectPath.current = onSetJPath('quality')}
                addonAfter={<EyeOutlined className='cursor-pointer' onClick={onPreview('quality')} />}
              />
            </Form.Item>
            <div className='text-right'>
              <Button type="default" onClick={onPreviewPayloadInfo}>
                Preview payload info <EyeOutlined />
              </Button>
            </div>
          </Form>
        </Col>
        <Col span={12}>
          <div className='json-path-preview'>
            <JsonView value={previewResult} style={basicTheme} displayDataTypes={false} />
          </div>
        </Col>
      </Row>
      <Divider />
      <div style={{ textAlign: 'left' }}>
        {renderJson(jsonObj, false)}
      </div>
    </div >
  )
}

export default App
