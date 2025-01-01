import { AxiosError } from "axios";
import Button, { ButtonType } from "components/Elements/Buttonv2";
import { keyBy } from "lodash";
import FlowBuilderModal from "pages/FlowBuilderv2/Elements/FlowBuilderModal";
import { FC, useEffect, useState } from "react";
import { confirmAlert } from "react-confirm-alert";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  AttributeQueryStatement,
  StatementValueType,
} from "reducers/flow-builder.reducer";
import ApiService from "services/api.service";
import ImportCompletion, {
  ImportCompletionSegmentProps,
} from "./ImportCompletion";
import ImportTabOne, { ImportOptions } from "./ImportTabOne";
import MappingTab from "./MappingTab";
import MapValidationErrors from "./Modals/MapValidationErrors";
import { Attribute, AttributeType } from "pages/PeopleSettings/PeopleSettings";

const tabs = [
  { title: "Upload CSV File" },
  { title: "Map data attributes" },
  { title: "Import Completion" },
];

export interface ImportAttribute {
  attribute: Attribute;
  skip?: boolean;
}

export interface ImportParams {
  headers: Record<string, { header: string; preview: any[] }>;
  file?: {
    fileName: string;
    fileKey: string;
  };
  emptyCount: number;
  primaryAttribute: null | Attribute;
}

export type MappingParams = Record<
  string,
  {
    asAttribute?: ImportAttribute;
    is_primary: boolean;
    doNotOverwrite: boolean;
  }
>;

enum ValidationError {
  UNMAPPED_ATTRIBUTES,
  PRIMARY_REQUIRED,
  PRIMARY_MAP_REQUIRED,
}

export interface PreviewImportResults {
  total: number;
  final: number;
  updated: number;
  created: number;
  skipped: number;
  url: string;
}

export interface PeopleImportProps {
  inSegment?: boolean;
}

const PeopleImport: FC<PeopleImportProps> = ({ inSegment }) => {
  const [tabIndex, setTabIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [fileData, setFileData] = useState<ImportParams>();
  const [mappingSettings, setMappingSettings] = useState<MappingParams>({});
  const [importPreview, setImportPreview] = useState<PreviewImportResults>();
  const [importOption, setImportOption] = useState<ImportOptions>(
    inSegment ? ImportOptions.NEW_AND_EXISTING : ImportOptions.NEW
  );
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );
  const [isValidationInProcess, setIsValidationInProcess] = useState(false);
  const [isImportStarting, setIsImportStarting] = useState(false);
  const [completionSegment, setCompletionSegment] =
    useState<ImportCompletionSegmentProps>({
      name: "",
      description: "",
      withSegment: false,
    });
  const navigate = useNavigate();

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data } = await ApiService.get({
        url: "/customers/getLastImportCSV",
      });
      if (!data.fileKey) {
        setFileData(undefined);
      } else {
        setFileData({
          headers: data.headers,
          file: {
            fileKey: data.fileKey,
            fileName: data.fileName,
          },
          emptyCount: data.emptyCount,
          primaryAttribute: data.primaryAttribute,
        });

        setMappingSettings(
          keyBy(
            Object.keys(data.headers).map((el) => ({
              head: el,
              asAttribute: undefined,
              is_primary: false,
              doNotOverwrite: false,
            })),
            "head"
          )
        );
      }
    } catch (error) {}
    setIsLoading(false);
  };

  const validationContent = {
    [ValidationError.UNMAPPED_ATTRIBUTES]: {
      title: "You have unmapped attributes",
      desc: "Unmapped attributes will not be imported. Do you want to proceed without mapping these attributes?",
      cancel: "Go Back and Map",
      confirm: "Proceed",
    },
    [ValidationError.PRIMARY_REQUIRED]: {
      title: "Primary key missing",
      desc: "You don't have a primary key specified, please specify a primary key and try again.",
      cancel: "",
      confirm: "Got it",
    },
    [ValidationError.PRIMARY_MAP_REQUIRED]: {
      title: "Primary key attribute not mapped",
      desc: `You don't have a field that maps to your primary key (${fileData?.primaryAttribute?.name}), please specify a field that maps to ${fileData?.primaryAttribute?.name} and try again.`,
      cancel: "",
      confirm: "Got it",
    },
  };

  const handleMappingSettingsUpdate = (val: MappingParams) => {
    setMappingSettings((prev) => ({ ...prev, ...val }));
  };

  const tabToComponent: Record<number, React.ReactNode> = {
    0: (
      <ImportTabOne
        setIsLoading={setIsLoading}
        isLoading={isLoading}
        fileData={fileData}
        importOption={importOption}
        setImportOption={setImportOption}
        onUpdate={() => loadData()}
        segment={completionSegment}
        setSegment={setCompletionSegment}
        inSegment={inSegment}
      />
    ),
    1: (
      <MappingTab
        setIsLoading={setIsLoading}
        mappingSettings={mappingSettings}
        isLoading={isLoading}
        updateSettings={handleMappingSettingsUpdate}
        fileData={fileData}
      />
    ),
    2: (
      <ImportCompletion
        preview={importPreview}
        segment={completionSegment}
        setSegment={setCompletionSegment}
        inSegment={inSegment}
      />
    ),
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async () => {
    if (isLoading) return;

    if (!fileData?.file) {
      navigate("/people");
      return;
    }

    confirmAlert({
      title: "Confirm cancel?",
      message: "Are you sure? After cancel you will have to upload file again!",
      buttons: [
        {
          label: "Yes",
          onClick: async () => {
            setIsLoading(true);
            try {
              await ApiService.post({
                url: `/customers/imports/delete/${fileData.file!.fileKey}`,
              });
              navigate("/people");
            } catch (error) {
              toast.error("Error during file deletion.");
            }
            setIsLoading(false);
          },
        },
        {
          label: "No",
        },
      ],
    });
  };

  const handleValidationProcess = async () => {
    setIsValidationInProcess(true);
    try {
      const { data } = await ApiService.post({
        url: `customers/attributes/count-import-preview`,
        options: {
          mapping: mappingSettings,
          importOption: importOption,
          fileKey: fileData?.file?.fileKey,
        },
      });
      setImportPreview({ ...data });
      setTabIndex(tabIndex + 1);
    } catch (error) {
      if (error instanceof AxiosError) {
        // @ts-ignore
        toast.error(error.response?.data?.message);
      }
    }
    setIsValidationInProcess(false);
  };

  const handleValidationConfirm = async () => {
    const currentError = validationErrors[0];

    if (
      currentError === ValidationError.PRIMARY_REQUIRED ||
      currentError === ValidationError.PRIMARY_MAP_REQUIRED
    ) {
      setValidationErrors([]);
      return;
    }

    const errors = [...validationErrors];

    if (currentError === ValidationError.UNMAPPED_ATTRIBUTES) {
      errors.shift();
      setValidationErrors([...errors]);
    }

    if (!errors.length) {
      handleValidationProcess();
    }
  };

  const handle2TabValidation = async () => {
    const pk = Object.values(mappingSettings).find(
      (el) =>
        el.is_primary &&
        el.asAttribute?.attribute.name &&
        el.asAttribute?.attribute.attribute_type.name &&
        !el.asAttribute.skip
    );
    const errors: ValidationError[] = [];

    if (!pk && !fileData?.primaryAttribute) {
      errors.push(ValidationError.PRIMARY_REQUIRED);
    }
    if (!pk && fileData?.primaryAttribute) {
      errors.push(ValidationError.PRIMARY_MAP_REQUIRED);
    }
    if (
      Object.values(mappingSettings).some(
        (el) =>
          !el.asAttribute?.attribute?.name ||
          !el.asAttribute?.attribute?.attribute_type.name
      )
    ) {
      errors.push(ValidationError.UNMAPPED_ATTRIBUTES);
    }

    if (errors.length === 0) {
      await handleValidationConfirm();
    }

    setValidationErrors(errors);
  };

  const handleValidationCancel = () => {
    setValidationErrors([]);
  };

  const handleStartImport = async () => {
    setIsImportStarting(true);
    try {
      await ApiService.post({
        url: `customers/attributes/start-import`,
        options: {
          mapping: mappingSettings,
          importOption: importOption,
          fileKey: fileData?.file?.fileKey,
          ...(completionSegment.withSegment && completionSegment.name
            ? {
                withSegment: {
                  name: completionSegment.name,
                  description: completionSegment.description,
                },
              }
            : {}),
        },
      });
      toast.success("Import started");
      navigate("/people");
    } catch (error) {
      if (error instanceof AxiosError) {
        // @ts-ignore
        toast.error(error.response?.data?.message);
      }
    }
    setIsImportStarting(false);
  };

  return (
    <div>
      <div className="w-full bg-white py-8 px-10 font-inter font-semibold text-[#111827] text-xl border-t border-b border-[#E5E7EB]">
        {inSegment ? "Upload CSV" : "Import users"}
      </div>
      <div className="w-full px-5 mt-4">
        <div className="flex flex-col w-full h-full bg-white py-5">
          <div className="w-full bg-white rounded">
            <div className="flex justify-center items-center gap-4">
              {tabs.map((el, i) => (
                <div key={i} className="flex items-center">
                  <div
                    className={`text-base font-roboto flex justify-center transition-all items-center min-w-[24px] max-w-[24px] min-h-[24px] max-h-6 rounded-full border ${
                      i == tabIndex
                        ? "bg-[#6366F1] border-[#6366F1] text-white"
                        : i < tabIndex
                        ? "bg-[#22C55E] border-[#22C55E]"
                        : "bg-transparent border-[#9CA3AF] text-[#9CA3AF]"
                    }`}
                  >
                    {i < tabIndex ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="13"
                        viewBox="0 0 12 13"
                        fill="none"
                      >
                        <path
                          d="M11.3578 2.52051H10.4216C10.2904 2.52051 10.1658 2.58078 10.0855 2.6839L4.56358 9.67899L1.91581 6.32408C1.87576 6.27323 1.82471 6.23211 1.76648 6.20381C1.70826 6.17551 1.64439 6.16077 1.57965 6.16069H0.643492C0.55376 6.16069 0.504207 6.26381 0.559117 6.33345L4.22742 10.9808C4.39885 11.1977 4.72831 11.1977 4.90108 10.9808L11.4422 2.69194C11.4971 2.62363 11.4475 2.52051 11.3578 2.52051Z"
                          fill="white"
                        />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <div
                    className={`${
                      i == tabIndex
                        ? "text-base text-[#111827] font-semibold"
                        : i < tabIndex
                        ? "text-sm text-[#111827]"
                        : "text-sm text-[#9CA3AF]"
                    } mx-2 whitespace-nowrap font-inter transition-all`}
                  >
                    {el.title}
                  </div>
                  {tabs.length - 1 !== i && (
                    <div
                      className={`${
                        i < tabIndex ? "border-[#22C55E]" : "border-[#E5E7EB]"
                      } ml-2 border-t w-[124px] transition-all`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <hr className="border-[#E5E7EB] mt-5" />
          {tabToComponent[tabIndex]}
          <hr className="border-[#E5E7EB] mb-5" />
          <div
            className={`${
              tabIndex !== 1 ? "max-w-[800px]" : "max-w-full px-5"
            } flex mx-auto w-full justify-end gap-[10px]`}
          >
            <Button
              type={ButtonType.SECONDARY}
              className="text-[#6366F1] border-[#6366F1] disabled:grayscale"
              disabled={isLoading}
              onClick={() => {
                if (tabIndex === 0) handleDelete();
                else setTabIndex(tabIndex - 1);
              }}
              data-testid={tabIndex === 0 ? "cancel-button" : "back-button"}
            >
              {tabIndex === 0 ? "Cancel" : "Back"}
            </Button>
            <Button
              type={ButtonType.PRIMARY}
              className="disabled:grayscale"
              disabled={
                isLoading ||
                (tabIndex === 0 && !fileData?.file) ||
                (inSegment && !completionSegment.withSegment) ||
                (tabIndex === 2 &&
                  completionSegment.withSegment &&
                  !completionSegment.name)
              }
              onClick={() => {
                if (tabIndex === 0) setTabIndex(tabIndex + 1);
                else if (tabIndex === 1) handle2TabValidation();
                else if (tabIndex === 2) handleStartImport();
              }}
              id={tabIndex === 2 ? "import-button" : "next-button"}
            >
              {tabIndex === 2 ? "Import" : "Next"}
            </Button>
          </div>
          {validationErrors.length > 0 && (
            <MapValidationErrors
              isOpen={!!validationErrors.length}
              title={validationContent[validationErrors[0]].title}
              desc={validationContent[validationErrors[0]].desc}
              cancelText={validationContent[validationErrors[0]].cancel}
              confirmText={validationContent[validationErrors[0]].confirm}
              onClose={handleValidationCancel}
              onConfirm={handleValidationConfirm}
            />
          )}
          <FlowBuilderModal isOpen={isValidationInProcess}>
            <div className="w-full flex flex-col items-center justify-center">
              <div className="relative bg-transparent border-t-transparent  border-[#6366F1] border-4 rounded-full w-10 h-10 animate-spin" />
              <div className="my-2 text-base text-center font-roboto text-[#4B5563] animate-pulse">
                Performing calculation...
              </div>
            </div>
          </FlowBuilderModal>
          <FlowBuilderModal isOpen={isImportStarting}>
            <div className="w-full flex flex-col items-center justify-center">
              <div className="relative bg-transparent border-t-transparent  border-[#6366F1] border-4 rounded-full w-10 h-10 animate-spin" />
              <div className="my-2 text-center text-base font-roboto text-[#4B5563] animate-pulse">
                Starting import...
              </div>
            </div>
          </FlowBuilderModal>
        </div>
      </div>
    </div>
  );
};

export default PeopleImport;
