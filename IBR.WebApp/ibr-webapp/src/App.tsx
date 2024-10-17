import { CSSProperties, useMemo, useRef, useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.scss'
import { JSONPath } from 'jsonpath-plus';
import JsonView from '@uiw/react-json-view';
import { Button, Col, Divider, Form, Input, message, Row, Select, Space, Table, TableProps, Tabs, Typography, Upload } from 'antd';
import { DeleteOutlined, EyeOutlined, PlusOutlined, RedoOutlined, ScanOutlined, UploadOutlined } from '@ant-design/icons';
import { readFileAsString } from './utils/common-utils';
import { basicTheme } from '@uiw/react-json-view/basic';
import { isArray, isEmpty, isUndefined, uniq, uniqueId } from 'lodash';

const { Title } = Typography;

interface IDeviceTemplateConfig {
  metricKeysPath: string;
  deviceMetrics: IDeviceMetricSettings[];
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
  path?: string | null;
  basePath?: string | null;

  // view
  editable: boolean;
  rowKey: string;
}

const getDataType = (value: any) => {
  const vType = typeof value;
  switch (vType) {
    case 'number': {
      if (Math.floor(value) === value)
        return 'int';
      return 'double';
    }
    case 'string':
      return 'text';
    case 'boolean':
      return 'bool';
    default:
      return 'JSON';
  }
};

function App() {
  const [publishForm] = Form.useForm<IPublishForm>();
  const [configForm] = Form.useForm<IDeviceTemplateConfig>();
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
  const [metricKeys, setMetricKeys] = useState<string[]>([]);

  const reloadMetrics = () => setDeviceMetrics(prev => [...prev]);

  const getMetricKey = (jsonPath: string) => {
    let key = jsonPath.replace(/[*$~]/g, '')
    return key.split('.').filter(entry => !!entry).join('.');
  };

  const getMetricKeyBasePath = (keyToReplace: string) => {
    const metricKeysPath = configForm.getFieldValue('metricKeysPath') as string;
    if (!metricKeysPath.includes('*~')) return null;
    const pathKey = metricKeysPath.replace('*~', keyToReplace);
    return pathKey;
  }

  const columns: TableProps<IDeviceMetricSettings>['columns'] = [
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      render: (value, record) => <Input
        style={{ width: 200 }}
        value={value}
        onChange={(e) => {
          record.key = e.target.value;
          reloadMetrics();
        }}
      />
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (value, record) => <Input
        style={{ width: 200 }}
        value={value}
        onChange={(e) => {
          record.name = e.target.value;
          reloadMetrics();
        }}
      />
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (value, record) => (<Select
        style={{ width: 120 }}
        value={value}
        onChange={(value) => {
          record.type = value;
          record.editable = false;
          switch (record.type) {
            case 'device_id': record.dataType = 'text'; break;
            case 'timestamp': record.dataType = 'timestamp'; break;
            case 'quality': record.dataType = 'int'; break;
            default: record.editable = true;
          }
          reloadMetrics();
        }}
        options={[
          { value: 'device_id', label: 'device_id' },
          { value: 'timestamp', label: 'timestamp' },
          { value: 'quality', label: 'quality' },
          { value: 'metric', label: 'metric' }
        ]}
      />)
    },
    {
      title: 'Data type',
      key: 'dataType',
      dataIndex: 'dataType',
      render: (value, record) => (record.editable
        ? (
          <Select
            style={{ width: 120 }}
            value={value}
            onChange={(value) => {
              record.dataType = value;
              reloadMetrics();
            }}
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
      dataIndex: 'path',
      render: (value, record) => <Input
        style={{ width: 300 }}
        value={value}
        onFocus={() => onSelectPath.current = onSelectJPath(record.key, false)}
        onChange={(e) => {
          record.path = e.target.value;
          reloadMetrics();
        }}
      />
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => <Space>
        <EyeOutlined className='cursor-pointer' onClick={onPreview(record.path, record.key)} />
        <DeleteOutlined style={{ color: 'red' }} className='cursor-pointer' onClick={() => {
          setDeviceMetrics(prev => prev.filter(m => m.key !== record.key));
        }} />
      </Space>
    }
  ];

  const setJPath = (key: keyof IDeviceTemplateConfig, jPath: string) => configForm.setFieldValue(key, jPath);
  const onSelectJPath = (key: string, isConfig: boolean) => (jPath: string) => {
    let finalPath = jPath;
    let sampleValue: any;
    let matchResult = JSONPath({ path: finalPath, json: jsonObj });
    if (matchResult.length) {
      sampleValue = matchResult[0];
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
          sampleValue = matchResult[0];
        }
      }
      if (maxFoundPath) finalPath = maxFoundPath;
    }

    if (isConfig) {
      setJPath(key as any, finalPath);
      if (key === 'metricKeysPath') {
        const metricKeys = extractJsonPathValues(finalPath);
        setMetricKeys(uniq(metricKeys));
      }
    } else {
      const metric = getMetric(key);
      if (!metric)
        return;

      metricKeys.forEach(k => {
        const basePath = getMetricKeyBasePath(k);
        if (!basePath)
          return;
        const baseMetricKey = getMetricKey(basePath);
        const metricKey = getMetricKey(finalPath);
        if (baseMetricKey !== metricKey && finalPath.startsWith(basePath)) {
          finalPath = '{metric_base}' + finalPath.substring(basePath.length);
        }
      });

      if (!isUndefined(sampleValue)) {
        metric.path = finalPath;
        if (metric.editable) {
          const dataType = getDataType(sampleValue);
          metric.dataType = dataType;
        }
        const genKey = getMetricKey(finalPath);
        if (!metric.key) metric.key = genKey;
        if (!metric.name) metric.name = genKey;
        reloadMetrics();
      }
    }
  }

  const extractJsonPathValues = (jsonPath: string, key?: string) => {
    let finalResult: any;
    if (jsonPath?.includes('{metric_base}')) {
      finalResult = {};
      const metric = key && getMetric(key);
      if (metric && metric.basePath) {
        const mPath = jsonPath.replace('{metric_base}', metric.basePath);
        finalResult = JSONPath({ path: mPath, json: jsonObj });
      } else {
        metricKeys.forEach((k: string) => {
          const basePath = getMetricKeyBasePath(k);
          const mPath = basePath ? jsonPath.replace('{metric_base}', basePath) : jsonPath;
          const result = JSONPath({ path: mPath, json: jsonObj });
          finalResult[k] = result;
        });
      }
    } else {
      finalResult = JSONPath({ path: jsonPath, json: jsonObj });
    };
    return finalResult;
  }

  const onPreview = (jsonPath: string | undefined | null, metricKey?: string) => () => {
    try {
      if (!jsonPath) {
        setPreviewResult({});
        return;
      }

      const values = extractJsonPathValues(jsonPath, metricKey)
      setPreviewResult(values);
    } catch {
      setPreviewResult({});
    }
  }

  const getMetric = (key: string) => deviceMetrics.find(m => m.key === key);

  const onParsePayload = () => {
    if (!isEmpty(metricKeys)) {
      const currentKeys: string[] = [];
      metricKeys.forEach(key => {
        const basePath = getMetricKeyBasePath(key);
        key = basePath ? getMetricKey(basePath) : key;
        currentKeys.push(key);
        const metric = getMetric(key);
        if (!metric) {
          const sampleValue = basePath && extractJsonPathValues(basePath)[0];
          const dataType = getDataType(sampleValue);
          deviceMetrics.push({
            rowKey: uniqueId(),
            key, name: key,
            type: 'metric',
            dataType,
            editable: true,
            path: basePath,
            basePath
          });
        } else {
          if (!metric.path)
            metric.path = basePath;
          metric.basePath = basePath;
        }
      });
      setDeviceMetrics(deviceMetrics.filter(m => !m.editable || currentKeys.includes(m.key)));
    }
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
      if (isArray(obj)) {
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
    if (!file)
      return;

    const deviceTemplate = configForm.getFieldsValue();
    deviceTemplate.deviceMetrics = deviceMetrics;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('config', JSON.stringify(deviceTemplate));
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
    formData.append('config', template);
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

  const populateDeviceTemplate = () => {
    return (<>
      <Divider>Device template</Divider>
      <div className='text-center'><i>NOTE: If you provide a batch payload, make sure the no of sample series per device metric is greater than 3 so system can easily detect the correct pattern</i></div>
      <Row gutter={[16, 16]}>
        <Col span={24}>
        </Col>
        <Col span={12}>
          <Form
            labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}
            layout={'horizontal'}
            form={configForm}
          >
            <Form.Item label="Metric keys" name="metricKeysPath">
              <Input
                onFocus={() => onSelectPath.current = onSelectJPath('metricKeysPath', true)}
                addonAfter={<EyeOutlined className='cursor-pointer' onClick={() => setPreviewResult(metricKeys)} />}
              />
            </Form.Item>
            <div className='text-right'>
              <Space>
                <Button type="default" onClick={() => {
                  setDeviceMetrics([]);
                  configForm.resetFields();
                }}>
                  Reset <RedoOutlined />
                </Button>
                <Button type="primary" onClick={onParsePayload}>
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
      </Row >
      <Divider>Device metrics</Divider>
      <div className='text-left mb-3'>
        <Button type="primary" onClick={() => {
          deviceMetrics.push({
            rowKey: uniqueId(),
            key: '',
            dataType: '',
            editable: true,
            name: '',
            type: 'metric'
          });
          reloadMetrics();
        }}>
          Add metric <PlusOutlined />
        </Button>
      </div>
      <Table<IDeviceMetricSettings> rowKey={'rowKey'} columns={columns} dataSource={deviceMetrics} />
      <Divider>JSON path selector</Divider>
      <div style={{ textAlign: 'left' }}>
        {renderJson(jsonObj, false)}
      </div>
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
        defaultActiveKey="device-template"
        items={[
          {
            key: 'device-template',
            label: 'Device template',
            children: wrapTabContent(populateDeviceTemplate())
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
