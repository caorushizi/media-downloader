import React, { ReactNode } from "react";
import { Button, Drawer, Popconfirm, Space, Tag, Tooltip } from "antd";
import ProDescriptions from "@ant-design/pro-descriptions";
import ProTable from "@ant-design/pro-table";
import "./index.scss";
import variables from "renderer/common/scripts/variables";
import {
  M3u8DLArgs,
  MediaGoArgs,
  SourceItem,
  SourceItemForm,
} from "types/common";
import NewSourceForm from "./NewSourceForm";
import { ipcExec, ipcGetStore } from "renderer/main-window/utils";
import {
  insertVideo,
  removeVideos,
  updateVideoStatus,
  updateVideoTitle,
  updateVideoUrl,
} from "renderer/common/scripts/localforge";
import { SourceStatus, SourceType } from "renderer/common/types";
import moment from "moment";
import {
  AppstoreAddOutlined,
  BlockOutlined,
  FolderOpenOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import { AppStateContext } from "renderer/main-window/types";
import { processHeaders } from "renderer/common/scripts/utils";
import onEvent from "renderer/common/scripts/td-utils";
import { ipcRenderer, remote } from "renderer/common/scripts/electron";

type ActionButton = {
  text: string;
  tooltip?: string;
  showTooltip?: boolean;
  cb: () => void;
};

interface Props {
  tableData: SourceItem[];
  changeSourceStatus: (
    source: SourceItem,
    status: SourceStatus
  ) => Promise<void>;
  workspace: string;
  updateTableData: () => Promise<void>;
}

interface State {
  isModalVisible: boolean;
  isDrawerVisible: boolean;
  currentSourceItem?: SourceItem;
}

type StatusMap = { get<T extends SourceStatus>(status: T): string };

const statusColorMap = new Map([
  [SourceStatus.Ready, "#108ee9"],
  [SourceStatus.Failed, "#f50"],
  [SourceStatus.Success, "#87d068"],
  [SourceStatus.Downloading, "#2db7f5"],
]) as StatusMap;

const statusTextMap = new Map([
  [SourceStatus.Ready, "未下载"],
  [SourceStatus.Failed, "下载失败"],
  [SourceStatus.Success, "下载成功"],
  [SourceStatus.Downloading, "正在下载"],
]);

const headersPlaceholder = `[可空] 请输入一行一个Header，例如：
Origin: https://www.sample.com
Referer: https://www.sample.com`;

// 下载列表
class DownloadList extends React.Component<Props, State> {
  actionRef = React.createRef();

  static contextType = AppStateContext;

  constructor(props: Props) {
    super(props);

    this.state = {
      isModalVisible: false,
      isDrawerVisible: false,
      currentSourceItem: undefined,
    };
  }

  // 向列表中插入一条数据并且请求详情
  insertUpdateTableData = async (item: SourceItemForm): Promise<SourceItem> => {
    const { updateTableData } = this.props;
    const { workspace } = this.context;
    const sourceItem: SourceItem = {
      status: SourceStatus.Ready,
      type: SourceType.M3u8,
      directory: workspace,
      title: item.title,
      duration: 0,
      url: item.url,
      createdAt: Date.now(),
      deleteSegments: item.delete,
    };
    if (item.headers) {
      sourceItem.headers = processHeaders(item.headers);
    }
    await insertVideo(sourceItem);
    await updateTableData();
    this.setState({
      isModalVisible: false,
    });
    return sourceItem;
  };

  // 新建下载窗口点击确定按钮
  handleOk = async (item: SourceItemForm): Promise<void> => {
    onEvent.addSourceAddSource();
    await this.insertUpdateTableData(item);
  };

  // 新建下载窗口点击立即下载
  handleDownload = async (item: SourceItemForm): Promise<void> => {
    onEvent.addSourceDownload();
    const sourceItem = await this.insertUpdateTableData(item);
    await this.downloadFile(sourceItem);
  };

  handleCancel = (): void => {
    this.setState({
      isModalVisible: false,
    });
  };

  // 抽屉关闭事件
  handleDrawerClose = (): void => {
    this.setState({
      isDrawerVisible: false,
    });
  };

  // 下载文件
  downloadFile = async (item: SourceItem): Promise<void> => {
    const { changeSourceStatus } = this.props;
    await changeSourceStatus(item, SourceStatus.Downloading);
    onEvent.tableStartDownload();
    const exeFile = await ipcGetStore("exeFile");
    const workspace = await ipcGetStore("workspace");
    const { title, headers, url } = item;

    let args: MediaGoArgs | M3u8DLArgs;
    if (exeFile === "mediago") {
      const headersString = Object.entries(headers || {})
        .map(([key, value]) => `${key}~${value}`)
        .join("|");
      args = {
        url,
        path: workspace, // 设定程序工作目录
        name: title, // 设定存储文件名(不包括后缀)
        headers: headersString,
      };
    } else {
      const headersString = Object.entries(headers || {})
        .map(([key, value]) => `${key}:${value}`)
        .join("|");
      args = {
        url,
        workDir: workspace, // 设定程序工作目录
        saveName: title, // 设定存储文件名(不包括后缀)
        headers: headersString,
        enableDelAfterDone: item.deleteSegments,
      };
    }

    const { code, msg } = await ipcExec(exeFile, args);
    if (code === 0) {
      await changeSourceStatus(item, SourceStatus.Success);
      onEvent.mainPageDownloadSuccess({ msg, url, exeFile });
    } else {
      await changeSourceStatus(item, SourceStatus.Failed);
      onEvent.mainPageDownloadFail({ msg, url, exeFile });
    }
  };

  // 展示资源详情
  showSourceDetail = (item: SourceItem): void => {
    onEvent.tableOpenDetail();
    this.setState({
      isDrawerVisible: true,
      currentSourceItem: item,
    });
  };

  // 打开所在文件夹
  openDirectory = async (): Promise<void> => {
    const { workspace } = this.props;
    await remote.shell.openPath(workspace);
  };

  // 渲染操作按钮
  renderActionButtons = (dom: React.ReactNode, row: SourceItem): ReactNode => {
    const { updateTableData } = this.props;
    const buttons: ActionButton[] = [];
    switch (row.status) {
      case SourceStatus.Success:
        // 下载成功
        buttons.push({
          text: "打开目录",
          cb: this.openDirectory,
        });
        buttons.push({
          text: "重新下载",
          cb: () => this.downloadFile(row),
        });
        break;
      case SourceStatus.Failed:
        // 下载失败
        buttons.push({
          text: "重新下载",
          cb: () => this.downloadFile(row),
        });
        buttons.push({
          text: "详情",
          cb: () => this.showSourceDetail(row),
        });
        break;
      case SourceStatus.Downloading:
        // 正在下载
        buttons.push({
          text: "重置状态",
          showTooltip: true,
          tooltip:
            "如果下载过程中将主程序关闭，那么主程序将无法接收到下载成功的消息，可以通过重置状态将状态改为未下载状态",
          cb: async () => {
            onEvent.tableReNewStatus();
            await updateVideoStatus(row, SourceStatus.Ready);
            await updateTableData();
          },
        });
        break;
      default:
        // 准备状态
        buttons.push({
          text: "下载",
          cb: () => this.downloadFile(row),
        });
        buttons.push({
          text: "详情",
          cb: () => this.showSourceDetail(row),
        });
        break;
    }
    return buttons.map((button) =>
      button.showTooltip ? (
        <Tooltip title={button.tooltip}>
          <a onClick={button.cb}>{button.text}</a>
        </Tooltip>
      ) : (
        <a onClick={button.cb}>{button.text}</a>
      )
    );
  };

  render(): ReactNode {
    const { isModalVisible, isDrawerVisible, currentSourceItem } = this.state;
    const { tableData, updateTableData } = this.props;
    return (
      <div className="download-list">
        <ProTable<SourceItem>
          rowSelection={{}}
          options={false}
          rowKey="url"
          search={false}
          pagination={{
            defaultPageSize: 5,
            pageSizeOptions: ["5", "10", "20"],
          }}
          tableAlertRender={({ selectedRowKeys, onCleanSelected }) => (
            <Space size={24}>
              <span>
                已选 {selectedRowKeys.length} 项
                <a style={{ marginLeft: 8 }} onClick={onCleanSelected}>
                  取消选择
                </a>
              </span>
            </Space>
          )}
          tableAlertOptionRender={({ selectedRowKeys, onCleanSelected }) => [
            // todo: 批量下载功能
            // <Button type="link">批量下载</Button>,
            <Popconfirm
              placement="bottomRight"
              title="确认要删除选中项目吗？"
              onConfirm={async () => {
                await removeVideos(selectedRowKeys);
                await updateTableData();
                onCleanSelected();
              }}
              okText="删除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
            >
              <Button type="link" danger>
                删除
              </Button>
            </Popconfirm>,
          ]}
          toolBarRender={() => [
            <Button
              onClick={() => {
                onEvent.mainPageNewSource();
                this.setState({ isModalVisible: true });
              }}
            >
              <AppstoreAddOutlined />
              新建下载
            </Button>,
            <Button
              onClick={() => {
                onEvent.mainPageOpenBrowserPage();
                ipcRenderer.send("openBrowserWindow");
              }}
            >
              <BlockOutlined />
              打开浏览器
            </Button>,
            <Button
              onClick={async () => {
                onEvent.mainPageOpenLocalPath();
                const { workspace } = this.props;
                await remote.shell.openPath(workspace);
              }}
            >
              <FolderOpenOutlined />
              本地路径
            </Button>,
            <Button
              onClick={async () => {
                onEvent.mainPageHelp();
                await remote.shell.openExternal(variables.urls.help);
              }}
            >
              <QuestionCircleOutlined />
              使用帮助
            </Button>,
          ]}
          columns={[
            {
              title: "标题",
              dataIndex: "title",
              className: "title",
              ellipsis: true,
              render: (dom: React.ReactNode) => dom,
            },
            {
              title: "创建时间",
              key: "createdAt",
              dataIndex: "createdAt",
              sorter: (a, b) => a.createdAt - b.createdAt,
              render: (dom, item) =>
                moment(item.createdAt).format("YYYY-MM-DD HH:mm:ss"),
            },
            {
              title: "状态",
              filters: true,
              onFilter: true,
              dataIndex: "status",
              initialValue: "all",
              valueType: "select",
              valueEnum: {
                all: {
                  text: "全部",
                  status: "Default",
                },
                ready: {
                  text: statusTextMap.get(SourceStatus.Ready),
                  status: statusTextMap.get(SourceStatus.Ready),
                },
                downloading: {
                  text: statusTextMap.get(SourceStatus.Downloading),
                  status: statusTextMap.get(SourceStatus.Downloading),
                },
                failed: {
                  text: statusTextMap.get(SourceStatus.Failed),
                  status: statusTextMap.get(SourceStatus.Failed),
                },
                success: {
                  text: statusTextMap.get(SourceStatus.Success),
                  status: statusTextMap.get(SourceStatus.Success),
                },
              },
              render: (value, row) => (
                <Tag color={statusColorMap.get(row.status)}>
                  {statusTextMap.get(row.status)}
                </Tag>
              ),
            },
            {
              title: "操作",
              key: "action",
              valueType: "option",
              render: this.renderActionButtons,
            },
          ]}
          dataSource={tableData}
          // scroll={{ y: "calc(100vh - 310px)" }}
        />

        {/*新建下载窗口*/}
        <NewSourceForm
          visible={isModalVisible}
          handleCancel={this.handleCancel}
          handleOk={this.handleOk}
          handleDownload={this.handleDownload}
        />

        <Drawer
          width={500}
          title="视频详情"
          onClose={this.handleDrawerClose}
          visible={isDrawerVisible}
          footer={
            <Space>
              <Button
                onClick={async () => {
                  if (currentSourceItem) {
                    this.setState({ isDrawerVisible: false });
                    await this.downloadFile(currentSourceItem);
                  }
                }}
              >
                立即下载
              </Button>
            </Space>
          }
        >
          <ProDescriptions
            actionRef={this.actionRef}
            layout="horizontal"
            labelStyle={{ width: 100, textAlign: "right" }}
            column={1}
            dataSource={currentSourceItem}
            editable={{
              onSave: async (key, row) => {
                if (currentSourceItem) {
                  const { updateTableData } = this.props;
                  if (key === "title") {
                    await updateVideoTitle(currentSourceItem, row.title);
                  } else if (key === "url") {
                    await updateVideoUrl(currentSourceItem, row.url);
                  }
                  await updateTableData();
                  this.setState({ currentSourceItem: row });
                }
              },
            }}
            columns={[
              {
                title: "视频标题",
                key: "title",
                dataIndex: "title",
              },
              {
                title: "m3u8地址",
                key: "url",
                dataIndex: "url",
              },
              // {
              //   title: "请求标头",
              //   key: "headers",
              //   dataIndex: "headers",
              //   renderFormItem: () => {
              //     return (
              //       <Input.TextArea rows={3} placeholder={headersPlaceholder} />
              //     );
              //   },
              // },
            ]}
          />
        </Drawer>
      </div>
    );
  }
}

export default DownloadList;
