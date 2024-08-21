import { CSSProperties, useMemo, useRef, useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.scss'
import { JSONPath } from 'jsonpath-plus';
import JsonView from '@uiw/react-json-view';
import { Button, Col, Divider, Form, Input, message, Row, Space, Tabs, Typography, Upload } from 'antd';
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

interface ITemplateForm {
  template: string;
}

function App() {
  const [publishForm] = Form.useForm<IPublishForm>();
  const [jPathForm] = Form.useForm<IJsonPathPayloadInfo>();
  const [templateForm] = Form.useForm<ITemplateForm>();
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
  const [metricKeysPath, setMetricKeysPath] = useState('');
  const metricKeys = useMemo<string[]>(() => {
    try {
      return (metricKeysPath && JSONPath({ path: metricKeysPath, json: jsonObj })) || [];
    } catch {
      return [];
    }
  }, [jsonObj, metricKeysPath]);

  const setJPath = (key: keyof IJsonPathPayloadInfo, jPath: string) => jPathForm.setFieldValue(key, jPath);
  const onSelectJPath = (key: keyof IJsonPathPayloadInfo, metricBased: boolean = false) => (jPath: string) => {
    let finalPath = jPath;
    let matchResult = JSONPath({ path: finalPath, json: jsonObj });
    if (matchResult.length === 1) {
      const matches = finalPath.matchAll(/[.]\d+/g);
      let match: IteratorResult<RegExpExecArray, any>;
      let currentPath: string | undefined;
      let maxFoundPath: string | undefined;
      let maxCount = 1;
      while ((match = matches.next()) && match?.value) {
        const matchValue = match.value[0];
        const matchIdx = match.value.index;
        currentPath = finalPath.substring(0, matchIdx) + '.*' + finalPath.substring(matchIdx + matchValue.length);
        matchResult = JSONPath({ path: currentPath, json: jsonObj });
        if (matchResult.length > maxCount) {
          maxCount = matchResult.length;
          maxFoundPath = currentPath;
        }
      }
      if (maxFoundPath) finalPath = maxFoundPath;
    }

    if (metricBased) {
      metricKeys.forEach(k => {
        const match = finalPath.match(new RegExp(`[.]${k}$|.${k}.`));
        if (match?.index) {
          const matchValue = match[0];
          const matchIdx = match.index;
          finalPath = finalPath.substring(0, matchIdx)
            + matchValue.replace(k, '{metric_key}')
            + finalPath.substring(matchIdx + matchValue.length);
        }
      })
    }

    setJPath(key, finalPath);
    if (key === 'metricKey') {
      setMetricKeysPath(finalPath);
    }
  }

  const onPreview = (key: keyof IJsonPathPayloadInfo) => () => {
    try {
      const jsonPath = jPathForm.getFieldValue(key);
      if (!jsonPath) {
        setPreviewResult({});
        return;
      }

      let finalResult: any;
      if (jsonPath?.includes('{metric_key}')) {
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
    setPreviewResult(jPathForm.getFieldsValue());
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

  const handleFetch = (func: () => Promise<Response | undefined | null>) => async () => {
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
    const payloadInfo = jPathForm.getFieldsValue();
    if (!file || !payloadInfo)
      return null;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('payloadInfo', JSON.stringify(payloadInfo));
    return await fetch(url, {
      method: 'post',
      body: formData
    });
  }

  const onPublishBatchWithJsonTemplate = async () => {
    const url = new URL('/api/publish-batch-with-template', import.meta.env.VITE_BASE_API);
    const file = publishForm.getFieldValue('file');
    const template = templateForm.getFieldValue('template');
    if (!file || !template)
      return null;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('payloadInfo', template);
    return await fetch(url, {
      method: 'post',
      body: formData
    });
  }

  const onUseSampleTemplate = async () => {
    const url = new URL('/api/sample-payloads/template', import.meta.env.VITE_BASE_API);
    const response = await fetch(url, {
      method: 'get'
    });
    const template = await response.text();
    templateForm.setFieldValue('template', template);
  }

  const populateActionForm = () => (<>
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
            <Button type="primary" onClick={handleFetch(onPublishSingle)}>
              Publish single
            </Button>
            <Button type="primary" onClick={handleFetch(onPublishMultiple)}>
              Publish multiple
            </Button>
            <Button type="primary" onClick={handleFetch(onPublishCsv)}>
              Publish CSV
            </Button>
            <Button type="primary" onClick={handleFetch(onPublishBatchWithJsonPath)}>
              Publish JSON path
            </Button>
            <Button type="primary" onClick={handleFetch(onPublishBatchWithJsonTemplate)}>
              Publish JSON template
            </Button>
          </Space>
        )}
      </Form.Item>
    </Form>
  </>)

  const populateJsonPathBuilder = () => (<>
    <Divider>JSON path builder</Divider>
    <Row gutter={[16, 16]}>
      <Col span={12}>
        <Form
          labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}
          layout={'horizontal'}
          form={jPathForm}
          initialValues={{}}
        >
          <Form.Item label="Device id" name="deviceId">
            <Input
              onFocus={() => onSelectPath.current = onSelectJPath('deviceId')}
              addonAfter={<EyeOutlined className='cursor-pointer' onClick={onPreview('deviceId')} />}
            />
          </Form.Item>
          <Form.Item label="Metric key" name="metricKey">
            <Input
              onFocus={() => onSelectPath.current = onSelectJPath('metricKey')}
              addonAfter={<EyeOutlined className='cursor-pointer' onClick={onPreview('metricKey')} />}
            />
          </Form.Item>
          <Form.Item label="Timestamp" name="timestamp">
            <Input
              onFocus={() => onSelectPath.current = onSelectJPath('timestamp', true)}
              addonAfter={<EyeOutlined className='cursor-pointer' onClick={onPreview('timestamp')} />}
            />
          </Form.Item>
          <Form.Item label="Value" name="value">
            <Input
              onFocus={() => onSelectPath.current = onSelectJPath('value', true)}
              addonAfter={<EyeOutlined className='cursor-pointer' onClick={onPreview('value')} />}
            />
          </Form.Item>
          <Form.Item label="Quality" name="quality">
            <Input
              onFocus={() => onSelectPath.current = onSelectJPath('quality', true)}
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
    <Divider>JSON path selector</Divider>
    <div style={{ textAlign: 'left' }}>
      {renderJson(jsonObj, false)}
    </div>
  </>)

  const populateJsonTemplateBuilder = () => (<>
    <Divider>JSON template builder</Divider>
    <Form
      labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}
      layout={'horizontal'}
      form={templateForm}
      initialValues={{}}
    >
      <Form.Item label="Template" name="template">
        <Input.TextArea rows={10} />
      </Form.Item>
      <div className='text-right'>
        <Button type="default" onClick={onUseSampleTemplate}>
          Use sample template
        </Button>
      </div>
    </Form>
  </>)

  const wrapTabContent = (content: any) => (
    <div className='bg-white p-3'>{content}</div>
  )

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
      {populateActionForm()}
      <Divider />
      <Tabs type='card' tabBarStyle={{ margin: 0 }}
        defaultActiveKey="json-path"
        items={[
          {
            key: 'json-path',
            label: 'JSON path',
            children: wrapTabContent(populateJsonPathBuilder())
          }, {
            key: 'json-template',
            label: 'JSON template',
            children: wrapTabContent(populateJsonTemplateBuilder())
          }
        ]}
      />
    </div >
  )
}

export default App
