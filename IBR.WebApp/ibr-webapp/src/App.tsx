import { CSSProperties, useMemo, useRef, useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.scss'
import { JSONPath } from 'jsonpath-plus';
import JsonView from '@uiw/react-json-view';
import { Button, Col, Divider, Form, Input, message, Row, Select, Space, Table, TableProps, Tabs, Typography, Upload } from 'antd';
import { EyeOutlined, ScanOutlined, UploadOutlined } from '@ant-design/icons';
import { readFileAsString } from './utils/common-utils';
import { basicTheme } from '@uiw/react-json-view/basic';
import { filter, isArray, isEmpty } from 'lodash';

const { Title } = Typography;

interface IJsonPathPayloadInfo {
  payloadType: string;
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

interface IDeviceMetricSettings {
  key: string;
  name: string;
  type: string;
  dataType: string;
  editable: boolean;
  path: string;
}

const columns: TableProps<IDeviceMetricSettings>['columns'] = [
  {
    title: 'Key',
    dataIndex: 'key',
    key: 'key'
  },
  {
    title: 'Name',
    dataIndex: 'name',
    key: 'name'
  },
  {
    title: 'Type',
    dataIndex: 'type',
    key: 'type'
  },
  {
    title: 'Data type',
    key: 'dataType',
    dataIndex: 'dataType',
    render: (value, record) => (record.editable
      ? (
        <Select
          defaultValue={value}
          style={{ width: 120 }}
          options={[
            { value: 'text', label: 'text' },
            { value: 'double', label: 'double' },
            { value: 'int', label: 'int' },
            { value: 'bool', label: 'bool' },
            { value: 'JSON', label: 'JSON' }
          ]}
        />
      )
      : value)
  },
  {
    title: 'Path',
    key: 'path',
    dataIndex: 'path'
  }
];

const getDataType = (value: any) => {
  const vType = typeof value;
  switch (vType) {
    case 'number':
      return 'double';
    case 'string':
      return 'text';
    case 'boolean':
      return 'bool';
    default:
      return 'JSON';
  }
};

const getPathKey = (jsonPath: string, metricKey?: string) => {
  let key = jsonPath.replace(/[$]/, '')
  if (metricKey) {
    const indexOfMetricKey = key.indexOf('{metric_key}');
    key = key.substring(0, indexOfMetricKey) + metricKey;
  }
  return key.split('.').filter(entry => !!entry).join('.');
};

function App() {
  const [publishForm] = Form.useForm<IPublishForm>();
  const [jPathForm] = Form.useForm<IJsonPathPayloadInfo>();
  const [templateForm] = Form.useForm<ITemplateForm>();
  const [json, setJson] = useState('{}');
  const [deviceMetrics, setDeviceMetrics] = useState<IDeviceMetricSettings[]>([]);
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
  const [metricKeys, setMetricKeys] = useState<string[]>([]);

  const recalculateMetricKeys = (path?: string) => {
    path = path || metricKeysPath;
    try {
      let metricKeys = (path && JSONPath({ path, json: jsonObj })) || [];
      const currentPaths = Object.values(jPathForm.getFieldsValue());
      metricKeys = filter(metricKeys, k => {
        // [NOTE] remove existing default keys (device_id, timestamp, quality) 
        const mKeyPath = path.replace('*~', k);
        return !currentPaths.includes(mKeyPath);
      });
      setMetricKeys(metricKeys);
    } catch {
      setMetricKeys([]);
    }
  }

  const setJPath = (key: keyof IJsonPathPayloadInfo, jPath: string) => jPathForm.setFieldValue(key, jPath);
  const onSelectJPath = (key: keyof IJsonPathPayloadInfo, isValue: boolean, metricBased: boolean = false) => (jPath: string) => {
    const payloadType = jPathForm.getFieldValue('payloadType');
    const isSingle = payloadType === 'single';
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

    if ((isValue || !isSingle) && metricBased) {
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
      recalculateMetricKeys(finalPath);
    } else {
      recalculateMetricKeys();
    }
  }

  const extractJsonPathValues = (jsonPath: string) => {
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
    };
    return finalResult;
  }

  const onPreview = (key: keyof IJsonPathPayloadInfo) => () => {
    try {
      const jsonPath = jPathForm.getFieldValue(key);
      if (!jsonPath) {
        setPreviewResult({});
        return;
      }

      const values = extractJsonPathValues(jsonPath)
      setPreviewResult(values);
    } catch {
      setPreviewResult({});
    }
  }

  const onPreviewPayloadInfo = () => {
    setPreviewResult(jPathForm.getFieldsValue());
  }

  const onParsePayload = () => {
    const newDeviceMetrics: IDeviceMetricSettings[] = [];
    const payloadInfo = jPathForm.getFieldsValue();
    const deviceIds = extractJsonPathValues(payloadInfo.deviceId);
    if (!isEmpty(deviceIds)) {
      newDeviceMetrics.push({
        key: 'device_id',
        name: 'Device ID',
        type: 'device_id',
        dataType: 'device_id (text)',
        editable: false,
        path: payloadInfo.deviceId
      })
    }

    const timestamps = extractJsonPathValues(payloadInfo.timestamp);
    if (!isEmpty(timestamps)) {
      newDeviceMetrics.push({
        key: 'timestamp',
        name: 'Timestamp',
        type: 'timestamp',
        dataType: 'timestamp',
        editable: false,
        path: payloadInfo.timestamp
      })
    }

    if (payloadInfo.quality) {
      const sampleQualities = extractJsonPathValues(payloadInfo.quality);
      if (!isEmpty(sampleQualities)) {
        newDeviceMetrics.push({
          key: 'quality',
          name: 'Quality',
          type: 'quality',
          dataType: 'quality (int)',
          editable: false,
          path: payloadInfo.quality
        });
      }
    }

    if (!isEmpty(metricKeys)) {
      const values = extractJsonPathValues(payloadInfo.value);
      const metricCache: any = {};
      metricKeys.forEach((k, idx) => {
        if (k in metricCache) return;
        let dataType: string | undefined;
        if (isArray(values)) {
          const value = values[idx];
          dataType = getDataType(value);
        } else {
          const value = values[k][0];
          dataType = getDataType(value);
        }

        const key = getPathKey(payloadInfo.value, k);
        newDeviceMetrics.push({
          key, name: key,
          type: 'metric',
          dataType: dataType,
          editable: true,
          path: payloadInfo.value
        });
      });
    }

    setDeviceMetrics(newDeviceMetrics);
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
    formData.append('payloadInfo', JSON.stringify({
      ...payloadInfo,
      metricKeys
    }));
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
      <Col span={24}>
        <div className='text-center'><i>NOTE: If you provide a batch payload, make sure the no of sample series per device metric is greater than 3 so system can easily detect the correct pattern</i></div>
      </Col>
      <Col span={12}>
        <Form
          labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}
          layout={'horizontal'}
          form={jPathForm}
          initialValues={{
            payloadType: 'single'
          }}
        >
          <Form.Item label="Payload type" name="payloadType">
            <Select
              options={[
                { value: 'single', label: 'Single' },
                { value: 'batch', label: 'Batch' }
              ]}
            />
          </Form.Item>
          <Form.Item label="Device id" name="deviceId">
            <Input
              onFocus={() => onSelectPath.current = onSelectJPath('deviceId', false)}
              addonAfter={<EyeOutlined className='cursor-pointer' onClick={onPreview('deviceId')} />}
            />
          </Form.Item>
          <Form.Item label="Metric key" name="metricKey">
            <Input
              onFocus={() => onSelectPath.current = onSelectJPath('metricKey', false)}
              addonAfter={<EyeOutlined className='cursor-pointer' onClick={() => setPreviewResult(metricKeys)} />}
            />
          </Form.Item>
          <Form.Item label="Timestamp" name="timestamp">
            <Input
              onFocus={() => onSelectPath.current = onSelectJPath('timestamp', false, true)}
              addonAfter={<EyeOutlined className='cursor-pointer' onClick={onPreview('timestamp')} />}
            />
          </Form.Item>
          <Form.Item label="Value" name="value">
            <Input
              onFocus={() => onSelectPath.current = onSelectJPath('value', true, true)}
              addonAfter={<EyeOutlined className='cursor-pointer' onClick={onPreview('value')} />}
            />
          </Form.Item>
          <Form.Item label="Quality" name="quality">
            <Input
              onFocus={() => onSelectPath.current = onSelectJPath('quality', false, true)}
              addonAfter={<EyeOutlined className='cursor-pointer' onClick={onPreview('quality')} />}
            />
          </Form.Item>
          <div className='text-right'>
            <Space>
              <Button type="default" onClick={onPreviewPayloadInfo}>
                Preview payload info <EyeOutlined />
              </Button>
              <Button type="default" onClick={onParsePayload}>
                Parse payload <ScanOutlined />
              </Button>
            </Space>
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

  const populateDeviceMetricConfiguration = () => {

    return (<>
      <Divider>Device metric configuration</Divider>
      <Table<IDeviceMetricSettings> columns={columns} dataSource={deviceMetrics} />
    </>)
  }

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
          },
          {
            key: 'device-metric',
            label: 'Device metrics',
            children: wrapTabContent(populateDeviceMetricConfiguration())
          },
          {
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
