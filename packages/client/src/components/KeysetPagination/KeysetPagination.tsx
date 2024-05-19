import React, { FC } from "react";
import chevronLeftImage from "./svg/chevron-left.svg";
import chevronRightImage from "./svg/chevron-right.svg";

interface PaginationProps {
  showNext: boolean;
  showPrev: boolean;
  showLast: boolean;
  showNextCursorEventId: string;
  showPrevCursorEventId: string;
  currentAnchor: string;
  setNewAnchor: (anchor: string) => void;
  setCursorEventId: (cursorEventId: string) => void;
  setIsFetchNewPageNeeded: (isFetchNewPageNeeded: boolean) => void;
}

const KeysetPagination: FC<PaginationProps> = ({
  showNext,
  showPrev,
  showNextCursorEventId,
  showPrevCursorEventId,
  showLast,
  currentAnchor,
  setNewAnchor,
  setCursorEventId,
  setIsFetchNewPageNeeded,
}) => {
  return (
    <div className="flex border border-[#E5E7EB] rounded-md w-fit">
      <button
        title="First Page"
        className="p-2 border-r-[1px] border-[#E5E7EB]"
        onClick={() => {
          if (currentAnchor !== "first_page") {
            setNewAnchor("first_page");
            setIsFetchNewPageNeeded(true);
          }
        }}
      >
        <img className="w-[20px] h-[20px]" src={chevronLeftImage} />
      </button>

      <div className="px-[16px] py-2 border-r-[1px] border-[#E5E7EB]">
        <button
          disabled={!showPrev}
          className={`px-[16px] py-2 border-[#E5E7EB]`}
          onClick={() => {
            setCursorEventId(showPrevCursorEventId);
            setNewAnchor("previous");
            setIsFetchNewPageNeeded(true);
          }}
        >
          Previous
        </button>
      </div>

      <div className="px-[16px] py-2 border-r-[1px] border-[#E5E7EB]">
        <button
          disabled={!showNext}
          className={`px-[16px] py-2 border-[#E5E7EB]`}
          onClick={() => {
            setCursorEventId(showNextCursorEventId);
            setNewAnchor("next");
            setIsFetchNewPageNeeded(true);
          }}
        >
          Next
        </button>
      </div>

      <button
        title="Last Page"
        disabled={!showLast}
        className="p-2"
        onClick={() => {
          if (currentAnchor !== "last_page") {
            setNewAnchor("last_page");
            setIsFetchNewPageNeeded(true);
          }
        }}
      >
        <img className="w-[20px] h-[20px]" src={chevronRightImage} />
      </button>
    </div>
  );
};

export default KeysetPagination;
