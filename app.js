// 환경 변수 로드 (예: .env 파일 또는 전역 변수)
// RPC_URL, CONTRACT_ADDRESS, CONTRACT_ABI, PRIVATE_KEYS 등은 외부에서 정의되어야 합니다.
// 예:
// const RPC_URL = "http://localhost:8545"; // Ganache 기본 RPC URL
// const CONTRACT_ADDRESS = "0xYourContractAddressHere"; // 배포된 컨트랙트 주소
// const CONTRACT_ABI = [...]; // 컨트랙트 ABI JSON
// const PRIVATE_KEYS = ["0xYourPrivateKey1", "0xYourPrivateKey2"]; // 사용할 개인 키 배열

const web3 = new Web3(RPC_URL);
const wallet = web3.eth.accounts.wallet;
const accounts = [];

// PRIVATE_KEYS에 있는 개인 키들을 사용하여 계정을 생성하고 지갑에 추가합니다.
PRIVATE_KEYS.forEach(pk => {
  const acc = web3.eth.accounts.privateKeyToAccount(pk);
  wallet.add(acc);
  accounts.push(acc);
});

console.log("초기 accounts 배열 (keys.js 로드 후):", accounts);

const contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);

// 계정 선택 드롭다운을 채우는 함수
function populateAccountSelector() {
  const selector = document.getElementById("accountSelector");
  selector.innerHTML = ""; // 기존 옵션 초기화

  if (accounts.length === 0) {
    console.warn("지갑에 추가된 계정이 없습니다. keys.js 파일을 확인하거나 개인 키를 올바르게 설정했는지 확인해주세요.");
    document.getElementById("accountAddress").textContent = "계정 주소: 계정 없음";
    const option = document.createElement("option");
    option.value = "";
    option.text = "계정 없음";
    selector.appendChild(option);
    selector.disabled = true;
    return;
  } else {
    selector.disabled = false;
  }

  accounts.forEach(acc => {
    const option = document.createElement("option");
    option.value = acc.address;
    option.text = acc.address;
    selector.appendChild(option);
  });

  // 드롭다운이 채워진 후 첫 번째 계정 주소를 UI에 표시 (기본 선택)
  // 오류 수정: 백틱(`)을 사용하여 템플릿 리터럴을 올바르게 사용
  document.getElementById("accountAddress").textContent = `계정 주소: ${accounts[0].address}`;
  selector.value = accounts[0].address; // 드롭다운의 기본 선택값을 첫 번째 계정으로 설정
}

// 현재 선택된 계정을 가져오는 함수
function getSelectedAccount() {
  const selector = document.getElementById("accountSelector");
  // 드롭다운이 비활성화되어 있거나 값이 없으면 null 반환
  if (selector.disabled || !selector.value) {
    return null;
  }
  const addr = selector.value;
  return accounts.find(acc => acc.address.toLowerCase() === addr.toLowerCase());
}

// 메시지를 특정 HTML 요소에 로깅하는 함수
function log(msg, elId, isError = true) {
  const element = document.getElementById(elId);
  if (element) {
    element.textContent = msg;
    element.style.color = isError ? 'red' : 'green'; // 성공/실패에 따라 색상 변경
  } else {
    console.error(`로그 대상 요소를 찾을 수 없습니다: #${elId}`);
  }
}

// 입찰을 실행하는 비동기 함수
async function placeBid() {
  const name = document.getElementById("bidderNameInput").value;
  const amountEth = document.getElementById("bidAmountInput").value;
  const sender = getSelectedAccount();

  log("", "bidMessage"); // 이전 메시지 지우기

  if (!sender) {
    log("입찰할 계정을 선택해주세요.", "bidMessage");
    return;
  }
  if (!name.trim()) {
    log("이름을 입력해주세요.", "bidMessage");
    return;
  }
  if (!amountEth || parseFloat(amountEth) <= 0) {
    log("유효한 입찰 금액을 입력해주세요.", "bidMessage");
    return;
  }

  const value = web3.utils.toWei(amountEth, "ether");

  try {
    const tx = contract.methods.placeBid(name);
    const gas = await tx.estimateGas({ from: sender.address, value });
    const gasPrice = await web3.eth.getGasPrice();

    console.log("입찰 트랜잭션 준비 중:", {
      from: sender.address,
      to: CONTRACT_ADDRESS,
      data: tx.encodeABI(),
      gas,
      gasPrice,
      value
    });

    const signed = await web3.eth.accounts.signTransaction({
      from: sender.address,
      to: CONTRACT_ADDRESS,
      data: tx.encodeABI(),
      gas,
      gasPrice,
      value
    }, sender.privateKey);

    const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);
    log("입찰 성공! 트랜잭션 해시: " + receipt.transactionHash, "bidMessage", false);
    await refreshStatus(); // 상태 새로고침
  } catch (err) {
    log("입찰 실패: " + err.message, "bidMessage");
    console.error("입찰 에러:", err);
  }
}

// 경매 상태를 새로고침하는 비동기 함수
async function refreshStatus() {
  log("", "auctionStatusError"); // 이전 메시지 지우기

  try {
    const isActive = await contract.methods.isActive().call();
    const highestBidRaw = await contract.methods.highestBid().call();
    const ownerAddress = await contract.methods.owner().call();
    const highestBidderAddress = await contract.methods.highestBidder().call();

    // getHighestBidder 호출 결과를 안전하게 처리
    let highestBidderName = "정보 없음";
    let highestBidEth = web3.utils.fromWei(highestBidRaw, 'ether');

    // 최고 입찰자가 설정되어 있고, 최고 입찰 금액이 0보다 클 때만 정보 조회
    if (highestBidderAddress !== "0x0000000000000000000000000000000000000000" && parseInt(highestBidRaw) > 0) {
        try {
            const highestBidderInfo = await contract.methods.getHighestBidder().call();
            document.getElementById("highestBidderName").textContent = highestBidderInfo[0];            // 이미지에서 보이는 오류 메시지 형태를 고려하여 `highestBidderInfo`가 예상치 못한 형태일 때
            // `Array.isArray` 체크는 잘 되어 있으나, 특정 상황에서 `BigInt`가 포함된 반환값이
            // `highestBidderInfo.length >= 2`를 만족하지 않을 수 있으므로 추가적인 디버깅 필요
            if (Array.isArray(highestBidderInfo) && highestBidderInfo.length >= 2) {
                highestBidderName = highestBidderInfo[0] || "이름 없음"; // 이름이 비어있을 경우 처리
                // highestBidderInfo[1]는 최고 입찰 금액인데, 이미 highestBidRaw로 처리하고 있으므로 여기서 직접 사용할 필요는 적음
                // 만약 이 값을 사용해야 한다면 BigInt 처리 필요:
                // const highestBidderAmount = web3.utils.fromWei(highestBidderInfo[1].toString(), 'ether');
            } else {
                // 이 경고가 가장 빈번하게 뜨는 부분으로 추정됩니다.
                // Smart Contract의 getHighestBidder() 함수가 특정 상황에서 반환하는 값의 형태를 다시 확인해보세요.
                // 예: 입찰자가 없을 때 `("", 0)`을 반환해야 하는데, `null`이나 `undefined`를 반환하는 경우 등.
                console.warn("getHighestBidder() 반환값이 예상과 다릅니다:", highestBidderInfo);
            }
        } catch (infoErr) {
            console.error("getHighestBidder 정보 조회 실패:", infoErr.message);
            highestBidderName = "조회 실패";
        }
    } else {
        // 최고 입찰자가 없거나 금액이 0일 경우
        highestBidderName = "아직 입찰 없음";
        highestBidEth = "0";
    }

    // UI 업데이트
    document.getElementById("auctionActive").textContent = isActive ? "예" : "아니오";
    document.getElementById("highestBid").textContent = highestBidEth;
    document.getElementById("highestBidderAddress").textContent = highestBidderAddress;
    document.getElementById("contractOwner").textContent = ownerAddress;

    // --- 경매 주최자 확인 및 버튼 제어 로직 ---
    const selectedAccount = getSelectedAccount();
    const endAuctionBtn = document.getElementById("endAuctionBtn");
    const endAuctionMessage = document.getElementById("endAuctionMessage");

    if (selectedAccount && ownerAddress && selectedAccount.address.toLowerCase() === ownerAddress.toLowerCase()) {
      endAuctionMessage.textContent = "현재 선택된 계정은 경매 주최자입니다. 경매를 종료할 수 있습니다.";
      endAuctionMessage.style.color = "green";
      endAuctionBtn.disabled = false; // 주최자면 버튼 활성화
    } else {
      endAuctionMessage.textContent = "현재 선택된 계정은 경매 주최자가 아닙니다. 경매 종료 권한이 없습니다.";
      endAuctionMessage.style.color = "red";
      endAuctionBtn.disabled = true; // 주최자가 아니면 버튼 비활성화
    }
    // --- 경매 주최자 확인 로직 끝 ---

  } catch (err) {
    console.error("경매 상태 조회 실패 (refreshStatus 전체):", err); // 상세 에러 로그
    log(`경매 상태 조회 실패: ${err.message}`, "auctionStatusError"); // HTML에 오류 표시

    // 에러 발생 시 UI에 "조회 실패" 표시
    document.getElementById("auctionActive").textContent = "조회 실패";
    document.getElementById("highestBid").textContent = "조회 실패";
    document.getElementById("highestBidderName").textContent = "조회 실패";
    document.getElementById("highestBidderAddress").textContent = "조회 실패";
    document.getElementById("contractOwner").textContent = "조회 실패";

    // 에러 발생 시 종료 버튼 비활성화 및 메시지 업데이트
    document.getElementById("endAuctionBtn").disabled = true;
    document.getElementById("endAuctionMessage").textContent = "경매 상태 조회 실패로 주최자 확인 불가.";
    document.getElementById("endAuctionMessage").style.color = "red";
  }
}

// 경매를 종료하는 비동기 함수
async function endAuction() {
  const sender = getSelectedAccount();
  log("", "endAuctionMessage"); // 이전 메시지 지우기

  if (!sender) {
    log("경매를 종료할 계정을 선택해주세요.", "endAuctionMessage");
    return;
  }

  try {
    const tx = contract.methods.endAuction();
    const gas = await tx.estimateGas({ from: sender.address });
    const gasPrice = await web3.eth.getGasPrice();

    console.log("경매 종료 트랜잭션 준비 중:", {
      from: sender.address,
      to: CONTRACT_ADDRESS,
      data: tx.encodeABI(),
      gas,
      gasPrice
    });

    const signed = await web3.eth.accounts.signTransaction({
      from: sender.address,
      to: CONTRACT_ADDRESS,
      data: tx.encodeABI(),
      gas,
      gasPrice
    }, sender.privateKey);

    const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);
    log("경매 종료 성공! 트랜잭션 해시: " + receipt.transactionHash, "endAuctionMessage", false);
    await refreshStatus(); // 상태 새로고침
    await getWinnerInfo(); // <-- 여기가 수정되었습니다. 매개변수 제거
  } catch (err) {
    log("경매 종료 실패: " + err.message, "endAuctionMessage");
    console.error("경매 종료 에러:", err);
  }
}

// 낙찰자 정보를 가져오는 비동기 함수
async function getWinnerInfo() {
  log("", "winnerMessage"); // 메시지 초기화용 커스텀 함수라고 가정

  try {
    const isActive = await contract.methods.isActive().call();

    if (isActive) {
      log("경매 진행 중 - 낙찰자 정보는 아직 없습니다.", "winnerMessage");
      document.getElementById("winnerName").textContent = "정보 없음";
      document.getElementById("winnerAmount").textContent = "정보 없음";
      document.getElementById("winnerAddress").textContent = "정보 없음";
      return;
    }

    const winnerInfo = await contract.methods.getWinnerInfo().call();
    console.log("getWinnerInfo 반환값:", winnerInfo);

    let name = winnerInfo[0] || "이름 없음";
    let amount = web3.utils.fromWei(winnerInfo[1].toString(), 'ether');
    let address = winnerInfo[2];

    document.getElementById("winnerName").textContent = name;
    document.getElementById("winnerAmount").textContent = amount;
    document.getElementById("winnerAddress").textContent = address;

  } catch (err) {
    log("낙찰자 정보 조회 중 오류 발생", "winnerMessage");
    console.error("getWinnerInfo 에러:", err.message);
    document.getElementById("winnerName").textContent = "정보 없음";
    document.getElementById("winnerAmount").textContent = "정보 없음";
    document.getElementById("winnerAddress").textContent = "정보 없음";
  }
}

// --- 이벤트 리스너 ---
document.getElementById("connectWalletBtn").addEventListener("click", async () => {
  console.log("지갑 연결 버튼 클릭됨.");
  // populateAccountSelector()와 refreshStatus()는 DOMContentLoaded에서 이미 호출되므로 중복 제거
  // 단, 사용자에게 명시적으로 "지갑 연결" 액션을 보여주기 위해 네트워크 상태만 업데이트
  document.getElementById("networkStatus").textContent = "네트워크: Ganache (로컬)";
});

document.getElementById("placeBidBtn").addEventListener("click", placeBid);
document.getElementById("refreshStatusBtn").addEventListener("click", refreshStatus);
document.getElementById("endAuctionBtn").addEventListener("click", endAuction);
document.getElementById("getWinnerBtn").addEventListener("click", getWinnerInfo);

// 페이지 로드 완료 시 초기화 (지갑 선택 드롭다운 채우기 및 상태 로드)
document.addEventListener("DOMContentLoaded", async () => {
    console.log("DOM Content Loaded. 초기화 시작.");
    populateAccountSelector(); // 페이지 로드 시 계정 드롭다운 채우기
    document.getElementById("networkStatus").textContent = "네트워크: Ganache (로컬)";
    // 초기에는 "경매 종료" 버튼 비활성화 및 메시지 설정
    document.getElementById("endAuctionBtn").disabled = true;
    document.getElementById("endAuctionMessage").textContent = "지갑 연결 및 상태 새로고침 후 주최자 여부를 확인할 수 있습니다.";
    document.getElementById("endAuctionMessage").style.color = "gray";

    await refreshStatus(); // 초기 경매 상태 로드
});

// 계정 선택이 변경될 때마다 UI 업데이트 및 주최자 여부 재확인
document.getElementById("accountSelector").addEventListener("change", async () => {
    const selectedAccount = getSelectedAccount();
    if (selectedAccount) {
        // 오류 수정: 백틱(`)을 사용하여 템플릿 리터럴을 올바르게 사용
        document.getElementById("accountAddress").textContent = `계정 주소: ${selectedAccount.address}`;
    }
    await refreshStatus(); // 계정 선택이 변경되면 상태 새로고침 및 주최자 여부 재확인
});
