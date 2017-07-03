# MicrobeTrace

©2017 Centers for Disease Control

Developed By [Tony Boyles](mailto:nsp3@cdc.gov) and Eric Aslakson

## Theory

MicrobeTrace ingests either a list of edges or a FASTA file containing many
genome sequences. From there, it should construct a network diagram (either the
network implied by the edges, or a Minimum-Spanning Tree based on the shortest
TN93 distances between genomes).

## Use

**WARNING**: This document hasn't been written properly. What you see here is
agglomeration of several iterations of requirements documents and associated
notes. You have my personal apologies for this. Please direct any questions to
[nsp3@cdc.gov](mailto:nsp3@cdc.gov).

### System Requirements

* MicrobeTrace is a Windows application (go figure). It has been tested on
Windows 7, but should work for Windows 10 as well. We may be able to package
Linux or Apple versions, [if requested](http://github.com/cdcgov/MicrobeTrace/issues).
* The installer is 50MB, and once it's installed, it will take up roughly 170MB.
* It only requires 128MB of RAM, but the size of the files you can process will
be proportional to the amount of RAM available.
* Any CPU that will run Windows will run MicrobeTrace.

### Installation
1. [Download the Installer](http://git.biotech.cdc.gov/nsp3/MicrobeTrace/raw/Releases/dist/MicrobeTrace%20Setup%200.16.4.exe)
2. Run it. It does *not* require administrative permissions.
3. Once the installer is done, it should launch automatically.

### Quick-Start

* how to create fasta, node and edge csv file inputs
* how to install product with default choices
* How to run program
* how to choose sample csv and fasta files in file select screen
* what are status displays and what is happening during progress meter countdowns
* how to color nodes and edges
* how to filter edges by threshold slider
* how to display maps, spreadsheet, histograms
* how to cross select nodes from one display to another

## Inputs

There are essentially three types of inputs: FASTA Files, Edge CSVs, and Node
CSVs. In order to construct a network, you must provide either a FASTA file or
an Edge CSV.

**Edge CSV**: An Edge CSV is a list of links, for which each link represents
some relationship between two individuals. These links could represent a
report of high-risk sexual contact. The file extension must be ".csv". The
contents of an Edge CSV should look something like this:

    source,target,length
    A,B,1
    A,C,2
    B,C,1
    A,D,.5

Each row represents an edge in the network. The `source` and `target` columns
represent the individuals (or *nodes*). Note that these column headers are
spelled using all-lower case. These columns are *mandatory*: a network cannot
be built without them. Any other columns are allowed.

**FASTA**: Strings of letters that represent DNA sequences. File extension
is variable (.FASTA, .FAS, .FA) but format must be as follows:

    > ID_of_person_A
    CCTCAGATCACTCTTTGGCAACGACCCCTCGTCACAATAAARATAGGRGGGCA
    ACTAAAGGAAGCTCTACTAGATACAGGAGCAGATGATACAGTATTAGAAGAAC
    TRAGTTTACCAGGAAGATGGAAACCAAAAATGATAGGGGGAATTGGAGGTTTT
    ATCAAAGTAAGACAGTATGATCAGGTAKCCATAGAAATCTGTGGGCATAAAGC
    TGTAGGTACAGTATTAGTAGGACCTACACCAGTCAACATAATTGG
    > ID_of_person_B
    CCTCAGATCACTCTTTGGCAACGACCCCTCGTCACAATAAARATAGGRGGGCA
    ACTAAAGGAAGCTCTACTAGATACAGGAGCAGATGATACAGTATTAGAAGAAC
    TRAGTTTACCAGGAAGATGGAAACCAAAAATGATAGGGGGAATTGGAGGTTTT
    ATCAAAGTAAGACAGTATGATCAGGTAKCCATAGAAATCTGTGGGCATAAAGC
    TGTAGGTACAGTATTAGTAGGACCTACACCAGTCAACATAATTGG


**Node CSV**: A Node CSV is a list that represents attribute data related to an
individual. File extension must be ".csv" One of the headers must be "id"
(Note that it is lower case), and the contents of that column must match the
ids of the FASTA file or the contents of the `source` and `target` columns from
the Edge CSV.

While node attribute tables are not necessary, node attributes are a vital
component to network exploration. To associate with the edge list properly, the
node's ID in the attribute table should exactly match its corresponding ID in
the edge list provided. All metadata associated with specific nodes (individuals
or sequences) should be appended as additional columns that follow the node ID
column.

* description of input checking, error and information dialog boxes - i.e. might
  go wrong with csv and fasta inputs
* description of various column types and how they are used for node/edge
  annotation (categorical, numeric, has_nulls)
* rules on disallowed inputs (node csv rows with identical node names cause
  repeating rows to be dropped)

Possible Input Combinations:

| Optional \ Mandatory | Edge CSV |  FASTA   |
| -------------------- | :------: | :------: |
| *(None)*             | &#x2714; | &#x2714; |
| *Node CSV*           | &#x2714; | &#x2714; |

content of input file screen including status messages, progress bar.

## Outputs

Node and edge attributes can be mapped to elements of the interactive graphic.
Specifically, categorical variables can be mapped to color and shape
characteristics whereas continuous variables are mapped to size and
transparency/opacity. String attributes, such as geographic region, can also be
displayed as textual labels anchored to its parent element. For example, a
two-letter State code can be superimposed on a node.

### Network View

Due to high DNA sequence similarity, transmission networks are often too dense
with information to be immediately useful and therefore robust filtering tools
are required. A user should be able to filter the visible information based on
two input methods: (1) click on appropriate variable and select value ranges an
(2) textual input. For example, if a user would like to filter by a particular
risk category (e.g., IDU), they select the risk category 'key' and select the
'IDU' value.

* output of hivtrace (with renamed nodes for repeated fasta input names)
* 'from' and 'to' names from edge csv
* how to zoom in and out, how to change all display parameters via menu
* how to single select, multiple select, single deselect nodes
* how to change displayed edges via threshold
* (nodes connected by nodes with length less than threshold length)
* how to choose layout methods (python ordination vs javascript gravity)
* non-uniqueness of gravity layout method
* how to fix jitter or oscillation
* content of spreadsheet
* only rows from node csv with names matching fasta and output from hivtrace are
  kept
* only rows from node csv with names matching edge csv are kept
* describe all gui elements of spreadsheet - how to filter, sort, set row
  display limit
* describe font selector
* how to singly select and deselect nodes, how to multiply select nodes
* content of map
* only rows from node csv with both lat, long columns and non-null entries
* how to single select, multiple select, and single deselect nodes
* content of histogram HIV-sequence data is input and processed into a
  comma-separated ?edge list? (Fig2). The edge list represents the cumulative
  distribution of genetic distances between HIV sequences.

This distribution can be visualized as a histogram.

* what is it exactly
* how should it inform the threshold setting
* how to select nodes to be included in histogram

## When something doesn't work

What can go wrong will go wrong.  How to tell what went wrong and how to fix it.

* flow chart with debug/correction steps
* list of pre-checked debug input files and what output from them should look
  like
* How/to whom to report errors
* how to find status data to attach to debug request email
* how to do screen dumps to attach to debug request email
* email of CDC support rep
* how to bring up javascript debug window during support call
* list of debug commands and expected results

Warranties, limitation of liability statements

## Acknowledgements

HIVTrace, other included packages

thanks for support of taxpayers/CDC during development

wishes for success to users
