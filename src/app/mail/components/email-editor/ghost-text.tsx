import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import React from 'react'

export default function GhostText(props: NodeViewProps) {
    return (
        <NodeViewWrapper as='span'>
            <NodeViewContent className="text-gray-300 select-none !inline" as='span' >
                {props.node.attrs.content}
            </NodeViewContent>
        </NodeViewWrapper>
    )
}
