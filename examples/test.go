package main

import (
	"crypto/sha256"
	"encoding/json"
	"flag"
	"fmt"
	"math/rand"
	"runtime"
	"sync"
	"time"
)

type Account struct {
	Identifier string    `json:"identifier"`
	Balances   []Balance `json:"balances"`
}

type Balance struct {
	Asset   string  `json:"asset"`
	Balance float64 `json:"balance"`
}

type MerkleNode struct {
	Hash  []byte
	Left  *MerkleNode
	Right *MerkleNode
}

// createMerkleTreeForAccounts constructs a Merkle tree from a slice of accounts
//
// It takes a slice of Account structs and returns a pointer to the root MerkleNode of the constructed tree.
//
// Parameters:
//   - accounts: a slice of Account structs containing balances to be included in the Merkle tree
//
// Returns:
//   a pointer to the root MerkleNode representing the Merkle tree built from the account balances
func createMerkleTreeForAccounts(accounts []Account) *MerkleNode {
	var allBalances []Balance
	for _, account := range accounts {
		allBalances = append(allBalances, account.Balances...)
	}

	leaves := make([]*MerkleNode, len(allBalances))
	for i, balance := range allBalances {
		data, _ := json.Marshal(balance)
		hash := sha256.Sum256(data)
		leaves[i] = &MerkleNode{Hash: hash[:]}
	}

	return buildTree(leaves)
}

// buildTree constructs a Merkle tree from a slice of MerkleNode pointers.
//
// It takes a slice of MerkleNode pointers and recursively builds a Merkle tree by combining the hashes of the nodes.
//
// Parameters:
//   - nodes: a slice of pointers to MerkleNode, representing the leaf nodes of the tree.
//
// Returns:
//   a pointer to the root MerkleNode of the constructed Merkle tree, or nil if the input slice is empty.
func buildTree(nodes []*MerkleNode) *MerkleNode {
	if len(nodes) == 0 {
		return nil
	}
	if len(nodes) == 1 {
		return nodes[0]
	}

	var nextLevel []*MerkleNode

	for i := 0; i < len(nodes); i += 2 {
		left := nodes[i]
		var right *MerkleNode
		if i+1 < len(nodes) {
			right = nodes[i+1]
		} else {
			right = &MerkleNode{Hash: left.Hash}
		}

		combined := append(left.Hash, right.Hash...)
		hash := sha256.Sum256(combined)
		parent := &MerkleNode{
			Hash:  hash[:],
			Left:  left,
			Right: right,
		}
		nextLevel = append(nextLevel, parent)
	}

	return buildTree(nextLevel)
}

// createMerkleTreeForAccountsConcurrent creates a Merkle tree from a slice of accounts concurrently.
//
// It takes a slice of Account structs and returns a pointer to the root MerkleNode of the constructed tree.
//
// Parameters:
//   - accounts: a slice of Account structs containing balances to be included in the Merkle tree.
//
// Returns:
//   a pointer to the root MerkleNode representing the constructed Merkle tree.
func createMerkleTreeForAccountsConcurrent(accounts []Account) *MerkleNode {
	var allBalances []Balance
	for _, account := range accounts {
		allBalances = append(allBalances, account.Balances...)
	}

	leaves := make([]*MerkleNode, len(allBalances))
	numWorkers := runtime.NumCPU()
	chunkSize := (len(allBalances) + numWorkers - 1) / numWorkers

	var wg sync.WaitGroup
	wg.Add(numWorkers)

	for i := 0; i < numWorkers; i++ {
		start := i * chunkSize
		end := (i + 1) * chunkSize
		if end > len(allBalances) {
			end = len(allBalances)
		}

		go func(start, end int) {
			defer wg.Done()
			for j := start; j < end; j++ {
				data, _ := json.Marshal(allBalances[j])
				hash := sha256.Sum256(data)
				leaves[j] = &MerkleNode{Hash: hash[:]}
			}
		}(start, end)
	}

	wg.Wait()

	return buildTreeParallel(leaves)
}

// buildTreeParallel constructs a Merkle tree from a slice of Merkle nodes in parallel.
//
// It takes a slice of MerkleNode pointers and returns the root MerkleNode of the constructed tree.
//
// Parameters:
//   - nodes: a slice of pointers to MerkleNode that represent the leaf nodes of the tree.
//
// Returns:
//   a pointer to the root MerkleNode of the constructed tree, or nil if no nodes are provided.
func buildTreeParallel(nodes []*MerkleNode) *MerkleNode {
	for len(nodes) > 1 {
		nextLevel := make([]*MerkleNode, (len(nodes)+1)/2)
		var wg sync.WaitGroup
		wg.Add(len(nextLevel))

		for i := 0; i < len(nodes); i += 2 {
			go func(i int) {
				defer wg.Done()
				left := nodes[i]
				var right *MerkleNode
				if i+1 < len(nodes) {
					right = nodes[i+1]
				} else {
					right = &MerkleNode{Hash: left.Hash}
				}

				combined := append(left.Hash, right.Hash...)
				hash := sha256.Sum256(combined)
				nextLevel[i/2] = &MerkleNode{
					Hash:  hash[:],
					Left:  left,
					Right: right,
				}
			}(i)
		}

		wg.Wait()
		nodes = nextLevel
	}

	if len(nodes) == 0 {
		return nil
	}
	return nodes[0]
}

// generateRandomAccounts generates a specified number of random accounts
//
// It takes an integer parameter that specifies how many accounts to generate and returns a slice of Account structs.
//
// Parameters:
//   - count: the number of random accounts to generate
//
// Returns:
//   a slice of Account structs, each containing a unique identifier and random balances for predefined assets
func generateRandomAccounts(count int) []Account {
    r := rand.New(rand.NewSource(time.Now().UnixNano()))
    accounts := make([]Account, count)
    assets := []string{"BTC", "ETH", "USDT", "XRP", "ADA"}
    
    for i := 0; i < count; i++ {
        account := Account{
            Identifier: fmt.Sprintf("user%d", i+1),
            Balances:   make([]Balance, len(assets)),
        }
        
        for j, asset := range assets {
            account.Balances[j] = Balance{
                Asset:   asset,
                Balance: r.Float64() * 1000, // Random balance between 0 and 1000
            }
        }
        
        accounts[i] = account
    }
    
    return accounts
}
// main generates a specified number of random accounts and creates a Merkle tree from them.
//
// It takes command-line flags to determine the number of accounts to generate and whether to use a concurrent implementation for creating the Merkle tree.
//
// Parameters:
//   - None
//
// Returns:
//   None
func main() {
	accountsCount := flag.Int("accounts", 1, "Number of random accounts to generate")
	isConcurrent := flag.Bool("concurrent", false, "Use concurrent implementation")
	flag.Parse()

	accounts := generateRandomAccounts(*accountsCount)

	fmt.Printf("Generated %d random accounts\n\n", *accountsCount)

	startTime := time.Now()

	var merkleRoot *MerkleNode
	if *isConcurrent {
		merkleRoot = createMerkleTreeForAccountsConcurrent(accounts)
	} else {
		merkleRoot = createMerkleTreeForAccounts(accounts)
	}

	duration := time.Since(startTime)

	fmt.Printf("Merkle Root Hash for all accounts: %x\n", merkleRoot.Hash)
	
	fmt.Printf("\nTime taken to create Merkle tree: %.4f seconds\n", duration.Seconds())

	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	fmt.Printf("Peak memory usage: %.2f MB\n", float64(m.TotalAlloc)/1024/1024)
}
